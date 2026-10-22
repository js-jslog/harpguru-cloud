# Phase A — Ground the domain

The detailed plan for Phase A of the
[roadmap](https://github.com/js-jslog/harpguru/blob/master/roadmap-planning/roadmap.md#phase-a--ground-the-domain--14-hrs--mostly-harpguru-cloud).
The roadmap says what the phase is. This file says how it is being done and how far it has
got. **Ships:** harpguru.com serving a real site over HTTPS, with the two `.well-known` files
that Phase B depends on.

Planned 2026-09-25. Starting state checked 2026-09-26 and recorded in the findings doc
under "AWS account state".

## Status

Update this table in the PR that moves a row. **You** means the user.

| # | Step | Status | Blocked on |
| --- | --- | --- | --- |
| — | `1-bake-harpguru-clone`: `/harpguru` baked into the image | **merged** 2026-09-27 | — |
| — | `1-working-agreements`: `CLAUDE.md` and this file | **merged** 2026-09-27 | — |
| — | `1-aws-concepts`: `docs/aws-concepts.md`, covering what has been touched so far | **merged** 2026-09-27 | — |
| 0 | *you*: `aws configure sso`, profile renamed to `[default]` | **done** 2026-09-26 | — |
| 1 | `1-cdk-app`: CDK skeleton | **merged** 2026-10-13 | — |
| 2 | `1-budget`: $10 budget | **merged** and deployed 2026-10-13; zero-spend budget deleted | — |
| 3 | `1-org-accounts`: workload account, OU, SCPs | **merged** and deployed 2026-10-22; `harpguru` profile added | — |
| 3a | `1-scp-custom-resource`: SCPs switched on by a custom resource in its own stack; the four decisions settled | **merged** and deployed 2026-10-22 | — |
| 3b | `1-identity-import`: console-made identity resources imported into `HarpguruIdentity` and `HarpguruBreakGlass`; the inventory of what CDK doesn't manage | coded on the branch; not imported | *you*: the import steps in #3b below |
| 4 | `1-org-audit`: CloudTrail, Config, GuardDuty | not started | — |
| 5 | *you*: bootstrap the workload account | **done** 2026-10-22, both regions | — |
| 6 | `1-dns-zone`: hosted zone, then the nameserver switch at Heart | not started | — |
| 7 | `1-certificate`: ACM in `us-east-1` | not started | #6 propagated |
| 8 | `1-site`: bucket, CloudFront, landing page, `.well-known` | not started | #7, and the inputs below |

## Accounts

- **Management account**, which already exists. It holds the Organization, IAM Identity Center
  (an organization instance in `eu-west-2`), billing and budgets, and, from step 4, the org
  trail. It is not where workloads run. SCPs never apply to the management account, which is
  the main reason to keep workloads out of it.
- **Workload account `harpguru`**, created in #3 inside a `Workloads` OU. Everything that
  serves harpguru.com lives here.

## Steps

**1 · `1-cdk-app`.** A TypeScript CDK app under `infra/`, managed with pnpm, with Jest
assertion tests and prettier, following the current `cdk init` template (`tsx`, `@swc/jest`).
It applies the tags `project`, `repository` and `managed-by` at the app root. The account
comes from the SSO login through `CDK_DEFAULT_ACCOUNT`. Email addresses come from the
gitignored `infra/deploy.local.json`. Nothing is deployed.

**2 · `1-budget`.** A USD monthly cost budget in the management account: $10, alerting at
50, 80 and 100% of actual spend and at 100% of forecast. It is a normal `cdk deploy`,
because the management account was already bootstrapped in `eu-west-2` on 2026-08-28. The
alert address is supplied at deploy time. Once this is live, **delete the console-made
`My Zero-Spend Budget`**: from #6 onwards the hosted zone alone would set it off every month.
Cost Anomaly Detection already runs with its default monitor, so it is not rebuilt.

**3 · `1-org-accounts`.** Three stacks in the management account, in `eu-west-2`, all with
termination protection.
- **`HarpguruPolicyTypes`** (added by `1-scp-custom-resource`): a custom resource that switches
  SCPs on for the root. It has no delete or update call, and the resource is `Retain`. It
  is a stack of its own so that no change to the guardrails or the accounts can reach it.
  The guardrails stack depends on it, so it deploys first.
- **`HarpguruGuardrails`**: a `Workloads` OU under the root, with three SCPs attached:
  - `harpguru-region-lock`: deny actions outside `eu-west-2` and `us-east-1`, exempting
    the five global services in the IAM guide's example
  - `harpguru-deny-root`: deny the root user
  - `harpguru-deny-leave-org`: deny leaving the Organization
- **`HarpguruAccounts`**: the `harpguru` account, created inside `Workloads`, and an
  Identity Center assignment giving `jslog` the `AdministratorAccess` permission set there,
  so the existing login reaches both accounts. The account email is a `+harpguru` alias of
  the user's address. The account is `RETAIN`, so tearing down a stack can never close it.
  The OU's ID arrives as a cross-stack reference, a weak one read with `Fn::GetStackOutput`,
  which also makes the guardrails deploy first.
  The account is therefore governed from the moment it exists.
- Values kept out of the repo (see Decisions) go in
  `infra/deploy.local.json`: the account email, the root
  ID, and the Identity Center instance, permission set and user IDs.
  `infra/scripts/identity-center-values.sh` prints the last four.

Deploying it, all *you*:
1. Run `scripts/identity-center-values.sh` and merge its output into `deploy.local.json`,
   alongside the real `workloadAccountEmail`.
2. `cdk diff` then `cdk deploy HarpguruPolicyTypes`. This switches SCPs on, which also
   attaches `FullAWSAccess` to every target, so nothing is restricted yet.
3. `cdk diff` then `cdk deploy HarpguruGuardrails`.
4. `cdk diff` then `cdk deploy HarpguruAccounts`. **This is the point of no return.** Account
   creation takes a few minutes. A closed account spends 90 days in a post-closure period,
   still counting against the account quota.
5. Add a `[profile harpguru]` to `~/.aws/config` using the `WorkloadAccountId` output, and
   check that both the portal and `aws sts get-caller-identity --profile harpguru` reach the
   new account.

Done 2026-10-22. Creating the account took under a minute of stack time, not the few minutes
expected. `aws sts get-caller-identity --profile harpguru` reached the new account. Run with
`!`, `cdk deploy` can't ask for approval of IAM changes, so after
reading each diff the deploy was run with `--require-approval never`. The first attempt
without it left an empty stack behind; see "Change sets" in `docs/aws-concepts.md`. A call
to `us-west-2` from the new account was refused by the region lock.

**3b · `1-identity-import`.** Two stacks, both termination protected, that adopt resources
made outside CloudFormation with `cdk import` rather than creating them:
- **`HarpguruIdentity`**, in the management account:
  - the `AdministratorAccess` permission set: one AWS managed policy, `AdministratorAccess`,
    and a one-hour session, as read on 2026-10-22
  - its assignment of `jslog` to the management account
- **`HarpguruBreakGlass`**, the first stack in the workload account: the
  `OrganizationAccountAccessRole` that Organizations made with the account, trusting the
  management account and holding `AdministratorAccess`. It is deployed with
  `--profile harpguru`, and pinned to the `workloadAccountId` in `deploy.local.json`, so CDK
  refuses to deploy it with the wrong credentials. Its trust policy names the
  `managementAccountId` there too.

Each is a stack of its own, apart from the existing ones, because each changes on its own
schedule and puts something different at risk: a mistake in `HarpguruIdentity` costs the
login, and one in `HarpguruBreakGlass` the way back in if the login is lost. Neither belongs
in `HarpguruPolicyTypes`, which is isolated so that nothing else is ever deployed beside its
SCP switch, nor in `HarpguruAccounts`, beside the account that can't be undone.

Every resource is `Retain`. An import never changes the resource, so the code matches the console
exactly, which means the permission set and the role go in **without** the project tags. They are added
afterwards by an ordinary deploy, which is a real change and shows in its diff. Both resources
name the permission set by the ARN in `deploy.local.json`, as `HarpguruAccounts` already does.
`docs/outside-cdk.md` lists everything else that CDK doesn't manage, and why.

Importing them, all *you*, from the branch before it is merged, so the merged PR describes
what is real. First merge `scripts/identity-center-values.sh`'s output into
`deploy.local.json` again, for the two account IDs. Then, for `HarpguruIdentity`:
1. `cdk diff HarpguruIdentity`. It shows both resources as `[+]`: a diff can't tell an import
   from a create. **Do not `cdk deploy` here.** A deploy would try to create a second
   permission set with the same name, and fail.
2. `npx cdk import HarpguruIdentity --resource-mapping-inline "$(scripts/identity-import-mapping.sh)"`.
   The script prints each resource's identifiers, read from `deploy.local.json` and the
   signed-in account. The import makes an `IMPORT` change set that creates the stack around
   the two existing resources.
3. Check for drift: `aws cloudformation detect-stack-drift --stack-name HarpguruIdentity`, then
   `aws cloudformation describe-stack-resource-drifts --stack-name HarpguruIdentity`. Both
   should be `IN_SYNC`.
4. `cdk diff HarpguruIdentity`, then deploy it with `--require-approval never`. The import
   leaves out CDK's metadata resource, so this adds it, and switches termination protection on.
5. The same again for `HarpguruBreakGlass`, adding `--profile harpguru` to every command. Its
   import needs no script, because the role's name is its only identifier:
   `npx cdk import HarpguruBreakGlass --profile harpguru --resource-mapping-inline '{"OrganizationAccountAccessRole":{"RoleName":"OrganizationAccountAccessRole"}}'`.
6. The agent then adds the tags in a second commit. `cdk diff` shows a tag change to each
   imported resource and nothing else, and you deploy both stacks.
7. Delete the workload account's two default VPCs:
   `AWS_PROFILE=harpguru scripts/delete-default-vpc.sh <region>` for `eu-west-2` and
   `us-east-1`, which shows what it would delete, then again with `--yes`. The agent then
   marks the log in `docs/outside-cdk.md` as run.

**4 · `1-org-audit`.**
- An organisation CloudTrail trail to S3.
- An SCP denying anyone from turning off CloudTrail or Config in `Workloads`, moved here from #3
  (see Decisions).
  - **Config:** the recorder will run in the workload account, and whatever role deploys and
    updates it must be allowed to stop or change it. So the SCP needs an exemption naming that
    role, and the role is not known until this step designs the Config deployment.
  - **CloudTrail:** the org trail lives in the management account, where SCPs never apply, and
    a member account can't alter an org trail anyway. The CloudTrail half would only protect a
    trail made inside the workload account, and none is planned; this step may drop it.
- Config limited to the two regions, with periodic rather than continuous recording. Config
  charges for each change it records, so it is the item most likely to creep.
- GuardDuty, which is free for 30 days and then pennies at this volume.

**5 · you: bootstrap.** `cdk bootstrap` for the workload account in **both** `eu-west-2` and
`us-east-1`. The certificate stack lives in `us-east-1`, which is easy to miss.
Done 2026-10-22, in one run with `--profile harpguru` and the project's three tags passed as
`--tags`, since bootstrap doesn't take them from the app. Default execution policy
(`AdministratorAccess`) and no trusted accounts. Bootstrap version 32 in both regions.

**6 · `1-dns-zone`.**
- Create the hosted zone in the workload account, with its nameservers as stack outputs.
- **Mail is live.** `contact@harpguru.com` forwards through Heart's mail hosting. So the zone
  has to carry `MX 10 mail.harpguru.com` and `mail.harpguru.com A 79.170.44.72` before
  anything moves. That is Heart's mail host, a different machine from `79.170.40.4`, the
  parked web address the apex and `www` point at today.
- Send a test message to `contact@`.
- You switch the nameservers at Heart. Delegate the domain; do not transfer it.
- Confirm the change has propagated, then send a second test message.
- Also check in Heart's panel that forwarding does not depend on Heart serving the zone.
- ~~Once the zone exists, activate `project` as a cost allocation tag.~~ Done early, on
  2026-10-22; see Decisions.

**7 · `1-certificate`.** An ACM certificate in `us-east-1` covering the apex and `www`,
validated through DNS in the zone. It reaches the site stack as a cross-region reference.

**8 · `1-site`.**
- A private S3 bucket behind CloudFront with OAC, and a response headers policy for
  the security headers.
- Route 53 alias records for the apex and `www`, plus a CloudFront Function that redirects
  `www` to the apex.
- The landing page: store links and the YouTube channel.
- `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`:
  - Served from the apex only, never through the redirect.
  - Served as `application/json`. The AASA file has no extension, so its `Content-Type` is
    set explicitly on upload.
  - Claim `/s/*` from the start. Apple caches the AASA file on its own CDN.
- A smoke-test script that checks each `.well-known` URL returns 200, `application/json` and
  no redirect.
- Identifiers from the app repo: iOS Team ID `6XJN2H9VQM`, bundle `com.jslog.harpguru`, and
  Android package `com.jslog.harpguru`.

## Inputs needed from the user

- For #8: the SHA-256 fingerprint of the Play **app signing** key (Play Console → App
  integrity), plus the App Store, Play Store and YouTube URLs. None of them is needed before
  #8.

## Decisions

- 2026-09-25: the budget is $10, with alerts to the user's address.
- 2026-09-26: `My Zero-Spend Budget` is deleted once the $10 budget is live.
- 2026-09-26: the workload account is named `harpguru` and uses the `+harpguru` email alias.
- 2026-09-26: mail is live, so the DNS move in #6 must carry the `MX` and `mail` records.
- 2026-09-26: security headers use a **response headers policy**, not CloudFront Functions.
  Functions are kept for request-dependent logic, such as the `www` redirect. The roadmap is
  updated to match.
- 2026-10-14, **superseded 2026-10-21**: SCPs are enabled on the root with a one-off CLI command
  rather than a custom resource. The trade is one manual command, run once, against a Lambda
  and a role in the management account. A custom resource's delete would disable SCPs across
  the Organization unless designed not to; see "Custom resources" in `docs/aws-concepts.md`.
- 2026-10-21: **SCPs are switched on by a custom resource**, in a stack of its own,
  `HarpguruPolicyTypes`. The user's choice, made after studying the trade: while learning, it
  is worth having the step as code. The delete risk is designed out three ways: no delete call,
  a `Retain` policy, and an isolated, termination-protected stack.
- 2026-10-14, **confirmed 2026-10-21**: the CloudTrail/Config protection SCP moves from #3 to #4, so
  its exemption is designed alongside the Config deployment it has to allow.
- 2026-10-14, **confirmed 2026-10-21**: the Identity Center and root identifiers live in
  `deploy.local.json`, not the repo. Keeping them out can be undone later; committing them
  can't, because the repo is public.
- 2026-10-14, **confirmed 2026-10-21**: centralised root access is deferred to a small step of its own.
  The SCP already blocks the root user, and the feature changes three Organization-wide
  settings.
- 2026-10-14: #3 is two stacks, `HarpguruGuardrails` then `HarpguruAccounts` (three since
  2026-10-21, with `HarpguruPolicyTypes` first), so the account
  is created inside an already-governed OU, and changes to SCPs never share a diff with the account.
- 2026-10-14: **the four provisional decisions above, the entries marked superseded or confirmed, were accepted
  by the user before they had studied them**, on the basis that each is easy to change, and
  were to be confirmed or changed once they had. **Settled 2026-10-21:** the first was changed
  and the other three confirmed. Changing each later:
  - SCP enablement, now a custom resource: `aws organizations disable-policy-type` would switch
    SCPs off, but it detaches every SCP in the Organization as it does, and nothing in this repo
    ever calls it. Going back to a one-off command would mean switching termination protection
    off and deleting `HarpguruPolicyTypes`. Its resource is `Retain`, so SCPs stay on; only the
    Lambda and its role go. Then the stack and the guardrails' `addDependency` on it come out of `infra/bin/harpguru.ts`. How
    the delete risk is designed out is in the "Custom resources" entry in
    `docs/aws-concepts.md`.
  - The CloudTrail/Config SCP: it is one more policy on `Workloads`, so it can go into #3 or #4
    at any time.
  - The identifiers: they can be committed at any time; once committed, the public history
    keeps them for good, which is why the reversible choice was taken first.
  - Centralised root access: it can be switched on at any time, and its root credentials
    management can then delete the root credentials of accounts that already exist. Switched on
    before #3's deploy, `harpguru` would be created with none at all. The settings involved are
    in the "Root user" entry in `docs/aws-concepts.md`.

  Merging #3 deploys nothing, but it does make every `cdk` command, even one for
  `HarpguruBudget`, need all of #3's values in `deploy.local.json`. What is hard to undo is
  the account itself, created by the first `cdk deploy HarpguruAccounts`: see #3, and the
  "Organizations" entry in `docs/aws-concepts.md`.
- 2026-10-22: **`project` was activated as a cost allocation tag**, rather than in #6. Cost
  Explorer already listed the key as `Inactive`, so waiting gained nothing. When it first
  appeared is unknown: the budget has carried it since 2026-10-13. Costs from before activation are only split by requesting a backfill,
  which was not done: they are pennies.
- 2026-10-22: the tutor does **not** open its replies with a table of terms. That agreement in
  `CLAUDE.md` is for the coding agent; the learning README says so.
- 2026-10-22: **what CloudFormation could manage but the console made is decided case by
  case.** The `AdministratorAccess` permission set and its management account assignment are
  imported (#3b): they decide who is an admin where, and `HarpguruAccounts` already depends on
  the permission set. **Changed the same day** at the user's request:
  `OrganizationAccountAccessRole` is imported too, into `HarpguruBreakGlass`, against the
  agent's suggestion to leave the break-glass role exactly as Organizations made it. The Organization and the Identity Center instance stay outside, by
  choice: both existed before the app, nothing about them changes, and a stack owning them
  would carry a delete risk like the one designed out of `HarpguruPolicyTypes`. The anomaly
  monitor stays outside, as decided 2026-09-26. The full list, with each "can't" and "chose
  not", is `docs/outside-cdk.md`.
- 2026-10-22: **the workload account's default VPCs in the two allowed regions are deleted, not
  imported**: nothing uses them, and Phase F designs its own network. It is done by hand with
  `infra/scripts/delete-default-vpc.sh`, and recorded in `docs/outside-cdk.md`, since no
  template shows it. The other 15 regions' default VPCs can't be reached past the region lock.
  The management account's 17 are not yet decided.
