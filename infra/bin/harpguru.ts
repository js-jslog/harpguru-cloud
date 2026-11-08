#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { AccountsStack } from '../lib/accounts-stack'
import { BudgetStack } from '../lib/budget-stack'
import { CertificateStack } from '../lib/certificate-stack'
import { ConfigStack } from '../lib/config-stack'
import { DnsStack } from '../lib/dns-stack'
import { GitHubStack } from '../lib/github-stack'
import { MailCanaryStack } from '../lib/mail-canary-stack'
import {
  EDGE_REGION,
  managementEnv,
  readDeployConfig,
  requireSetting,
  workloadEnv,
} from '../lib/config'
import { GuardDutyStack } from '../lib/guardduty-stack'
import { GuardrailsStack } from '../lib/guardrails-stack'
import { IdentityStack } from '../lib/identity-stack'
import { PolicyTypesStack } from '../lib/policy-types-stack'
import { SiteStack } from '../lib/site-stack'
import { applyProjectTags } from '../lib/tags'
import { TrailStack } from '../lib/trail-stack'

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

// Adopted from the console, not created; see lib/identity-stack.ts. Both
// resources are retained, and the stack is protected, because the login to
// every account depends on them.
new IdentityStack(app, 'HarpguruIdentity', {
  env: managementEnv(),
  description:
    'The AdministratorAccess permission set and its management account assignment',
  terminationProtection: true,
  identityCenterInstanceArn: requireSetting(
    config,
    'identityCenterInstanceArn'
  ),
  adminPermissionSetArn: requireSetting(config, 'adminPermissionSetArn'),
  adminPrincipalId: requireSetting(config, 'adminPrincipalId'),
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
guardrails.addStackDependency(policyTypes)

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

// The Organization's audit log. Protected, and its bucket retained: the
// record of who did what should outlast any mistake made in this code.
new TrailStack(app, 'HarpguruTrail', {
  env: managementEnv(),
  description: 'The Organization trail and the bucket its logs land in',
  terminationProtection: true,
  organizationId: requireSetting(config, 'organizationId'),
})

// GuardDuty in the management account, in both regions, since it holds the
// Organization and the login, each emailing its findings to the budget's
// address. Protected, like the other audit stacks: deleting a detector
// deletes its findings. SCPs never reach this account, so nothing guards
// these two but the login.
new GuardDutyStack(app, 'HarpguruGuardDutyManagement', {
  env: managementEnv(),
  description: 'GuardDuty in the management account, in London',
  terminationProtection: true,
  alertEmail: requireSetting(config, 'alertEmail'),
})
new GuardDutyStack(app, 'HarpguruGuardDutyManagementEdge', {
  env: managementEnv(EDGE_REGION),
  description: 'GuardDuty in the management account, in us-east-1',
  terminationProtection: true,
  alertEmail: requireSetting(config, 'alertEmail'),
})

// From here on, stacks live in the workload account, pinned to its ID: deploy
// them with `--profile harpguru`. Protected, because once the nameservers point
// at the zone, deleting it would take the domain's mail down.
const dns = new DnsStack(app, 'HarpguruDns', {
  env: workloadEnv(config),
  description: 'The harpguru.com hosted zone, carrying the mail records',
  terminationProtection: true,
})

// A weekly check that contact@ still forwards. Not protected: it holds nothing
// that can't be recreated, and deleting it takes its DKIM records with it.
new MailCanaryStack(app, 'HarpguruMailCanary', {
  env: workloadEnv(config),
  description: 'A weekly pair of messages that shows contact@ still forwards',
  zone: dns.zone,
  forwardingAddress: requireSetting(config, 'forwardingAddress'),
})

// Config, recording daily in both regions. Protected, like the trail, and
// guarded by the harpguru-protect-config SCP. London holds the bucket and the
// service-linked role, so it deploys first.
const configLondon = new ConfigStack(app, 'HarpguruConfig', {
  env: workloadEnv(config),
  description: 'Config in London: the recorder, its bucket and its role',
  terminationProtection: true,
  primary: true,
})
const configEdge = new ConfigStack(app, 'HarpguruConfigEdge', {
  env: workloadEnv(config, EDGE_REGION),
  description: 'Config in us-east-1, delivering to the London bucket',
  terminationProtection: true,
  primary: false,
})
configEdge.addStackDependency(configLondon)

// GuardDuty in the workload account, in both regions, as above. Here the
// harpguru-protect-guardduty SCP also guards the detector and its alert.
new GuardDutyStack(app, 'HarpguruGuardDutyWorkload', {
  env: workloadEnv(config),
  description: 'GuardDuty in the workload account, in London',
  terminationProtection: true,
  alertEmail: requireSetting(config, 'alertEmail'),
})
new GuardDutyStack(app, 'HarpguruGuardDutyWorkloadEdge', {
  env: workloadEnv(config, EDGE_REGION),
  description: 'GuardDuty in the workload account, in us-east-1',
  terminationProtection: true,
  alertEmail: requireSetting(config, 'alertEmail'),
})

// The certificate CloudFront will use from step 8, which only takes them from
// us-east-1. Its validation records go into the London zone, which reaches it
// as a weak reference: an output of HarpguruDns, read across regions.
const certificate = new CertificateStack(app, 'HarpguruCertificate', {
  env: workloadEnv(config, EDGE_REGION),
  description: 'The ACM certificate for harpguru.com and www, in us-east-1',
  zone: dns.zone,
})

// harpguru.com itself: the bucket, the CloudFront distribution, the landing
// page, the .well-known files, and the apex and www records. In London, with
// the zone; the certificate reaches it the other way across regions, as an
// output of HarpguruCertificate read from us-east-1.
const site = new SiteStack(app, 'HarpguruSite', {
  env: workloadEnv(config),
  description: 'harpguru.com: its bucket, CloudFront, landing page and records',
  zone: dns.zone,
  certificate: certificate.certificate,
})

// How harpguru's deploy workflow reaches the pages bucket: GitHub's OIDC
// provider and the role it assumes, with no access keys. In London beside the
// site, whose bucket and distribution it reads as weak cross-stack references.
new GitHubStack(app, 'HarpguruGitHub', {
  env: workloadEnv(config),
  description: "GitHub's OIDC provider and the role harpguru's deploys assume",
  pagesBucket: site.pagesBucket,
  distribution: site.distribution,
})
