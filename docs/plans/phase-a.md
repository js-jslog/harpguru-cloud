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
| 1 | `1-cdk-app`: CDK skeleton | pushed, PR to open | — |
| 2 | `1-budget`: $10 budget | not started | #1 |
| 3 | `1-org-accounts`: workload account, OU, SCPs | not started | #2 live |
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

**3 · `1-org-accounts`.**
- Enable the SCP policy type on the root, which is not yet done.
- Create a `Workloads` OU and the `harpguru` account inside it. The account email is a
  `+harpguru` alias of the user's address, supplied at deploy time. The account resource is
  `RETAIN`, so tearing down a stack can never close the account.
- Assign `jslog` the `AdministratorAccess` permission set in the new account, as code, so
  the existing login reaches both accounts. Without this, nobody can use the account.
- SCPs on the OU:
  - deny actions outside `eu-west-2` and `us-east-1`, with global services exempted
  - deny the root user
  - deny leaving the Organization
  - deny disabling CloudTrail or Config

**4 · `1-org-audit`.**
- An organisation CloudTrail trail to S3.
- Config limited to the two regions, with periodic rather than continuous recording. Config
  charges for each change it records, so it is the item most likely to creep.
- GuardDuty, which is free for 30 days and then pennies at this volume.

**5 · you: bootstrap.** `cdk bootstrap` for the workload account in **both** `eu-west-2` and
`us-east-1`. The certificate stack lives in `us-east-1`, which is easy to miss.

**6 · `1-dns-zone`.**
- Create the hosted zone in the workload account, with its nameservers as stack outputs.
- **Mail is live.** `contact@harpguru.com` forwards through Heart's mail hosting. So the zone
  has to carry `MX 10 mail.harpguru.com` and `mail.harpguru.com A 79.170.44.72` before
  anything moves.
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
