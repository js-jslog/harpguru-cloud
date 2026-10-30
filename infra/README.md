# infra

The CDK app for everything harpguru-cloud deploys. It is TypeScript, run with `tsx`, and
tested with Jest and CDK's assertions library.

```
cd infra
pnpm install
pnpm test          # unit tests against synthesised templates; no AWS access needed,
                   # so they can't show that AWS will accept a template: the deploy's
                   # change set is the first check against AWS
pnpm typecheck
pnpm format:check
cdk synth          # writes templates to cdk.out/ (type-checks first)
cdk diff           # what a deploy would change; needs `aws sso login`
cdk deploy <stack> # the user runs this, after reading the diff
```

`cdk` is the CLI baked into the image (pinned to 2.1139.0), not a project dependency.

## Deploy-time values

Some stacks need values that are fine to know but shouldn't be published, because this
repo is public: email addresses, and the Organization and Identity Center identifiers. They
live in `deploy.local.json`, a gitignored file beside `cdk.json`:

```
cp deploy.local.example.json deploy.local.json   # then fill it in
scripts/identity-center-values.sh                # prints the identifier values
```

Every stack is built on every `cdk` command, so the whole app fails at synth time if any value
is missing, naming the key, even when you only asked about one stack.
The file lives in the `/app` workspace volume, so it survives image rebuilds, but not
`runcontainer.ps1 destructive` or `purge`.

**One account ID is needed here: the workload account's**, as `workloadAccountId`.
`aws sts get-caller-identity --profile harpguru --query Account --output text` prints it.
Stacks in the workload account, from `HarpguruDns` on, are pinned to it and run with
`--profile harpguru`: `cdk diff HarpguruDns --profile harpguru`. Without the profile, CDK
refuses, because the management account's credentials can't use the workload account's
bootstrap roles. The management account's stacks still take their account from whoever is
signed in, through `CDK_DEFAULT_ACCOUNT`, which the CLI fills in from the SSO login.

## Layout

| Path                        | Holds                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bin/harpguru.ts`           | the app: creates each stack and applies the project tags                                               |
| `lib/config.ts`             | regions, the deploy-time values, the management and workload account environments                      |
| `lib/tags.ts`               | the tags every resource carries                                                                        |
| `lib/budget-stack.ts`       | `HarpguruBudget`: the $10 monthly budget, in the management account                                    |
| `lib/identity-stack.ts`     | `HarpguruIdentity`: the permission set and management account assignment, imported from the console    |
| `lib/policy-types-stack.ts` | `HarpguruPolicyTypes`: the custom resource that switches SCPs on                                       |
| `lib/guardrails-stack.ts`   | `HarpguruGuardrails`: the `Workloads` OU and its SCPs                                                  |
| `lib/accounts-stack.ts`     | `HarpguruAccounts`: the `harpguru` account and its Identity Center access                              |
| `lib/trail-stack.ts`        | `HarpguruTrail`: the Organization trail and its log bucket, in the management account                  |
| `lib/dns-stack.ts`          | `HarpguruDns`: the harpguru.com hosted zone and its mail records, in the workload account              |
| `lib/mail-canary-stack.ts`  | `HarpguruMailCanary`: the weekly messages that show `contact@` still forwards, in the workload account |
| `scripts/`                  | read-only helpers, such as printing values for `deploy.local.json`                                     |
| `test/`                     | one test file per module or stack, and `app.ts`, which gives tests `cdk.json`'s flags                  |
