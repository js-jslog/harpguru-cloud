# infra

The CDK app for everything harpguru-cloud deploys. It is TypeScript, run with `tsx`, and
tested with Jest and CDK's assertions library.

```
cd infra
pnpm install
pnpm test          # unit tests against synthesised templates; no AWS access needed
pnpm typecheck
pnpm format:check
cdk synth          # writes templates to cdk.out/ (type-checks first)
cdk diff           # what a deploy would change; needs `aws sso login`
cdk deploy <stack> # the user runs this, after reading the diff
```

`cdk` is the CLI baked into the image (pinned to 2.1139.0), not a project dependency.

## Deploy-time values

Some stacks need values that are fine to know but shouldn't be published, because this
repo is public: email addresses, for now. They live in `deploy.local.json` beside
`cdk.json`, which is gitignored:

```
cp deploy.local.example.json deploy.local.json   # then fill it in
```

A stack that needs a value it can't find fails at synth time and names the missing key.
The file lives in the `/app` workspace volume, so it survives image rebuilds, but not
`runcontainer.ps1 destructive` or `purge`.

**Account IDs are never needed here.** The target account comes from whoever is signed in,
through `CDK_DEFAULT_ACCOUNT`, which the CLI fills in from the SSO login.

## Layout

| Path              | Holds                                                               |
| ----------------- | ------------------------------------------------------------------- |
| `bin/harpguru.ts` | the app: creates each stack and applies the project tags            |
| `lib/config.ts`   | regions, the deploy-time values, the management account environment |
| `lib/tags.ts`     | the tags every resource carries                                     |
| `test/`           | one test file per module or stack                                   |
