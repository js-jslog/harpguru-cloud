#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { AccountsStack } from '../lib/accounts-stack'
import { BudgetStack } from '../lib/budget-stack'
import { managementEnv, readDeployConfig, requireSetting } from '../lib/config'
import { GuardrailsStack } from '../lib/guardrails-stack'
import { PolicyTypesStack } from '../lib/policy-types-stack'
import { applyProjectTags } from '../lib/tags'

const app = new App()
applyProjectTags(app)
const config = readDeployConfig()

// Stacks are added here as Phase A lands them; see docs/plans/phase-a.md.

new BudgetStack(app, 'HarpguruBudget', {
  env: managementEnv(),
  description:
    'Monthly cost budget and email alerts for the whole Organization',
  alertEmail: requireSetting(config, 'alertEmail'),
})

// SCPs must be switched on before any can be attached. This gets a stack of
// its own, so that nothing done to the guardrails can ever switch them off.
const policyTypes = new PolicyTypesStack(app, 'HarpguruPolicyTypes', {
  env: managementEnv(),
  description: "Switches SCPs on for the Organization's root",
  terminationProtection: true,
  organizationRootId: requireSetting(config, 'organizationRootId'),
})

// Deploy the guardrails first, so the account is born inside a governed OU.
// Both are termination protected: deleting either would remove the
// guardrails, and the account stack should never need deleting.
const guardrails = new GuardrailsStack(app, 'HarpguruGuardrails', {
  env: managementEnv(),
  description: 'The Workloads OU and the SCPs that govern it',
  terminationProtection: true,
  organizationRootId: requireSetting(config, 'organizationRootId'),
})
guardrails.addDependency(policyTypes)

new AccountsStack(app, 'HarpguruAccounts', {
  env: managementEnv(),
  description: 'The harpguru workload account and its Identity Center access',
  terminationProtection: true,
  parentOuId: guardrails.workloadsOu.attrId,
  workloadAccountEmail: requireSetting(config, 'workloadAccountEmail'),
  identityCenterInstanceArn: requireSetting(
    config,
    'identityCenterInstanceArn'
  ),
  adminPermissionSetArn: requireSetting(config, 'adminPermissionSetArn'),
  adminPrincipalId: requireSetting(config, 'adminPrincipalId'),
})
