import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Environment } from 'aws-cdk-lib'

// Everything lives in London, except what CloudFront insists on: its
// certificates must be issued in us-east-1.
export const PRIMARY_REGION = 'eu-west-2'
export const EDGE_REGION = 'us-east-1'

// Values that are fine to know but not to publish (this repo is public).
// They live in a gitignored file beside cdk.json; see
// deploy.local.example.json for its shape.
export type DeployConfig = {
  alertEmail?: string
  workloadAccountEmail?: string
  // Where Heart forwards contact@harpguru.com to; the mail canary writes to it.
  forwardingAddress?: string
  // Identifiers for the Organization and Identity Center. Not secrets, but
  // the same kind of identifier as the account ID, so kept out of the repo
  // too. scripts/identity-center-values.sh prints them.
  organizationRootId?: string
  identityCenterInstanceArn?: string
  adminPermissionSetArn?: string
  adminPrincipalId?: string
  // The one account ID this app reads. Pinning the workload account's stacks
  // to it makes CDK refuse to deploy them with the wrong profile, rather than
  // quietly targeting the management account.
  workloadAccountId?: string
}

export const DEPLOY_CONFIG_PATH = join(__dirname, '..', 'deploy.local.json')

export const readDeployConfig = (path = DEPLOY_CONFIG_PATH): DeployConfig =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}

export const requireSetting = (
  config: DeployConfig,
  key: keyof DeployConfig
): string => {
  const value = config[key]
  if (!value) {
    throw new Error(
      `Missing "${key}" in infra/deploy.local.json. ` +
        'Copy deploy.local.example.json to deploy.local.json and fill it in.'
    )
  }
  return value
}

// Stacks that target the management account take it from whoever is signed
// in (`aws sso login`). Unlike the workload stacks below, they are not pinned:
// that would need the management account's ID too, and nothing required it
// before step 7. So deploying one with `--profile harpguru` is not caught.
export const managementEnv = (): Environment => ({
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: PRIMARY_REGION,
})

// Stacks in the workload account are pinned to its ID, read from
// deploy.local.json, so they are deployed with `--profile harpguru`. Signed in
// to any other account, CDK refuses: those credentials can't reach this
// account's bootstrap roles.
export const workloadEnv = (config: DeployConfig): Environment => ({
  account: requireSetting(config, 'workloadAccountId'),
  region: PRIMARY_REGION,
})
