#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { BudgetStack } from '../lib/budget-stack'
import { managementEnv, readDeployConfig, requireSetting } from '../lib/config'
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
