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

// The account comes from whoever is signed in (`aws sso login`), so no
// account ID is ever committed. Stacks that target the management account
// use this.
export const managementEnv = (): Environment => ({
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: PRIMARY_REGION,
})
