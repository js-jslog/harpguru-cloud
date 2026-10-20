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
| 3 | `1-org-accounts`: workload account, OU, SCPs | merged; not deployed | *you*: settle the four provisional decisions, then the deploy steps in #3 below |
| 4 | `1-org-audit`: CloudTrail, Config, GuardDuty | not started | #3 |
| 5 | *you*: bootstrap the workload account | not started | #3 |
| 6 | `1-dns-zone`: hosted zone, then the nameserver switch at Heart | not started | #5 |
| 7 | `1-certificate`: ACM in `us-east-1` | not started | #6 propagated |
| 8 | `1-site`: bucket, CloudFront, landing page, `.well-known` | not started | #7, and the inputs below |

## Accounts

- **Management account**, which already exists. It holds the Organization, IAM Identity
  Center (an organization instance in `eu-west-2`), billing and budgets, and the org trail.
  It is not where workloads run. SCPs never apply to the management account, which is the
  main reason to keep workloads out of it.
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

**3 · `1-org-accounts`.** Two stacks in the management account, in `eu-west-2`, both with
termination protection.
- **`HarpguruGuardrails`**: a `Workloads` OU under the root, with three SCPs attached:
  - `harpguru-region-lock`: deny actions outside `eu-west-2` and `us-east-1`, exempting
    the five global services in the IAM guide's example
  - `harpguru-deny-root`: deny the root user
  - `harpguru-deny-leave-org`: deny leaving the Organization
- **`HarpguruAccounts`**: the `harpguru` account, created inside `Workloads`, and an
  Identity Center assignment giving `jslog` the `AdministratorAccess` permission set there,
  so the existing login reaches both accounts. The account email is a `+harpguru` alias of
  the user's address. The account is `RETAIN`, so tearing down a stack can never close it.
  The OU's ID arrives as a cross-stack import, which also makes the guardrails deploy first.
  The account is therefore governed from the moment it exists.
- Values kept out of the repo go in `infra/deploy.local.json`: the account email, the root
  ID, and the Identity Center instance, permission set and user IDs.
  `infra/scripts/identity-center-values.sh` prints the last four.

Deploying it, all *you*:
1. Run `aws organizations enable-policy-type --policy-type SERVICE_CONTROL_POLICY --root-id <root>`.
   No CloudFormation resource enables a policy type. This also attaches `FullAWSAccess` to
   every target, so nothing is restricted yet.
2. Run `scripts/identity-center-values.sh` and merge its output into `deploy.local.json`,
   alongside the real `workloadAccountEmail`.
3. `cdk diff` then `cdk deploy HarpguruGuardrails`.
4. `cdk diff` then `cdk deploy HarpguruAccounts`. **This is the point of no return.** Account
   creation takes a few minutes. A closed account spends 90 days in a post-closure period,
   still counting against the account quota.
5. Add a `[profile harpguru]` to `~/.aws/config` using the `WorkloadAccountId` output, and
   check that both the portal and `aws sts get-caller-identity --profile harpguru` reach the
   new account.

**4 · `1-org-audit`.**
- An organisation CloudTrail trail to S3.
- An SCP denying anyone from turning off CloudTrail or Config in `Workloads`, moved here from #3
  (provisional; see Decisions).
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
- Once the zone exists, **activate `project` as a cost allocation tag** in the management
  account. A key can only be activated once a resource carries it, and earlier costs are
  only split by requesting a backfill, so do it early.

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
- 2026-10-14, **provisional**: SCPs are enabled on the root with a one-off CLI command rather
  than a custom resource. Deleting a custom resource would disable SCPs across the
  Organization.
- 2026-10-14, **provisional**: the CloudTrail/Config protection SCP moves from #3 to #4, so
  its exemption is designed alongside the Config deployment it has to allow.
- 2026-10-14, **provisional**: the Identity Center and root identifiers live in
  `deploy.local.json`, not the repo. Keeping them out can be undone later; committing them
  can't, because the repo is public.
- 2026-10-14, **provisional**: centralised root access is deferred to a small step of its own.
  The SCP already blocks the root user, and the feature changes two Organization-wide
  settings.
- 2026-10-14: #3 is two stacks, `HarpguruGuardrails` then `HarpguruAccounts`, so the account
  is created inside an already-governed OU, and changes to SCPs never share a diff with the account.
- 2026-10-14: **the four provisional decisions above were accepted by the user before they had
  studied them**, on the basis that each is easy to change, and are to be confirmed or changed
  once they have. Changing each later:
  - SCP enablement: `aws organizations disable-policy-type` reverses it, but detaches every SCP
    in the Organization as it does. Moving to a custom resource later is new code, nothing more.
    The strongest case for that alternative, and why its delete risk can be designed out, is in
    the "Custom resources" entry in `docs/aws-concepts.md`.
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
