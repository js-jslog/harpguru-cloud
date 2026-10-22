import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { App } from 'aws-cdk-lib'

// An App carrying cdk.json's feature flags, so a test sees the template the
// real app synthesises. A bare `new App()` reads none of them: it once made
// the cross-stack test pass on an export the deployed app never uses.
export const appWithFlags = () =>
  new App({
    context: JSON.parse(readFileSync(join(__dirname, '..', 'cdk.json'), 'utf8'))
      .context,
  })
