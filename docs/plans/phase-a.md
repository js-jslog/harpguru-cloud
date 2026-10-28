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
| 3b | `1-identity-import`: the console-made permission set and its management account assignment imported into `HarpguruIdentity`; the inventory of what CDK doesn't manage | **merged**, imported and deployed 2026-10-22 | — |
| 4 | `1-org-audit`: CloudTrail, Config, GuardDuty | split into 4a–4c on 2026-10-27; **4a is on the branch `1-org-trail`**, pushed and not deployed, whose copy of this file has the detailed plan | *you*: 4a's deploy, in a new session |
| 5 | *you*: bootstrap the workload account | **done** 2026-10-22, both regions | — |
| 6 | `1-dns-zone`: hosted zone, then the nameserver switch at Heart | **done**: zone deployed 2026-10-26; switch made and mail tested 2026-10-27 | — |
| 6a | `1-mail-canary`: a weekly pair of messages showing `contact@` still forwards, in `HarpguruMailCanary` | **merged** and deployed 2026-10-27; first pair arrived 2026-10-28 | — |
| 7 | `1-certificate`: ACM in `us-east-1` | not started | — |
| 8 | `1-site`: bucket, CloudFront, landing page, `.well-known` | not started | #7, and the inputs below |

**Next up, as of 2026-10-28**, in the order the user asked for:
1. **Run the `refresh-learning` skill on the branch `1-canary-confirmed`**, the branch that
   holds this list. The user chose this on 2026-10-28, so the refresh and the canary's result
   go to `master` in one PR, and **that PR is not opened until the refresh is on it**. The
   syllabus is "As of 2026-10-26" and still says the nameserver switch has not been made; since
   then the switch (#6) and the mail canary (#6a) have merged. Not on `1-org-trail`: the skill
   teaches only what is on `master`. The user wants this before further progress.
2. **Continue #4a** from the branch `1-org-trail`: its copy of this file, step 4a, says exactly
   what is left.
3. Then #4b, #4c and #7, which are all unblocked.

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

**3b · `1-identity-import`.** One stack in the management account, `HarpguruIdentity`,
termination protected, that adopts two console-made resources with `cdk import` rather than
creating them:
- the `AdministratorAccess` permission set: one AWS managed policy, `AdministratorAccess`, and
  a one-hour session, as read on 2026-10-22
- its assignment of `jslog` to the management account

Both are `Retain`. It is a stack of its own, apart from the existing ones, because it changes
on its own schedule and puts something different at risk: a mistake in it costs the login. It
doesn't belong in `HarpguruPolicyTypes`, which is isolated so that nothing is ever deployed
beside its SCP switch, nor in `HarpguruAccounts`, beside the account that can't be undone.

An import doesn't apply the template to the resource, so the code had to match the console
exactly, which meant the permission set went in **without** the project tags. They were added
afterwards by an ordinary deploy, which is a real change and shows in its diff.
Its assignment names the permission set by the ARN in `deploy.local.json`, as the workload
account's assignment in `HarpguruAccounts` already does, rather than by a reference to the
resource beside it.
`docs/outside-cdk.md` lists everything else that CDK doesn't manage, and why.

Importing it, all *you*, from the branch before it is merged, so the merged PR describes what
is real:
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
4. With the drift check clean, the agent puts the tags back in the code. `cdk diff
   HarpguruIdentity` shows the tag change to the permission set, plus the stack description
   and the bootstrap parameter, which the import left out. The deploy also adds `CDKMetadata`,
   which the import left out too, but which `cdk diff` never shows. Then deploy it with `--require-approval never`.

Done 2026-10-22. After step 4 the stack was still `IN_SYNC`, and the login still reached both
accounts. What steps 1 to 3 showed:
- The diff's change set failed CloudFormation's early validation, because an assignment with
  that identifier "already exists". So a plain deploy would indeed have failed, and the mapping's
  identifiers were right. The diff fell back to comparing templates.
- The import completed, and termination protection was on from the start.
- Both resources were `IN_SYNC`. The import did change one thing: CloudFormation added its own
  `aws:cloudformation:*` tags to the permission set, as it does to every taggable resource a
  stack manages. It skipped the assignment, saying tags there would force a replacement.
  Drift detection ignores those tags.

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

Doing it, all *you*. Deploying the zone changes nothing live: the internet keeps asking
Heart until the nameservers move, so the steps can be split across sessions at the line.
1. `cdk diff HarpguruDns --profile harpguru`. It shows the zone and two record sets as `[+]`,
   all in the workload account. Without the profile, CDK refuses: the stack is pinned to the
   workload account's ID (see Decisions, 2026-10-26), and the refusal was seen on 2026-10-26.
   That pin arrived after the deploy below, which was checked by hand instead.
2. `cdk deploy HarpguruDns --profile harpguru`. The `NameServers` output lists the four
   nameservers. The zone is billed from now: $0.50 a month.

   *A good place to stop.*
3. Send a test message to `contact@` and check it arrives.
4. In Heart's panel, check that forwarding doesn't depend on Heart serving the zone, then
   replace Heart's nameservers with the four from the output.
5. When `curl -s 'https://dns.google/resolve?name=harpguru.com&type=NS'` shows the Route 53
   nameservers, and the same query with `type=MX` still shows `10 mail.harpguru.com`, send a
   second test message. Only this one tests the new zone: the first is a baseline, showing
   forwarding worked before anything moved. Sent earlier, the sender's mail server may still be
   asking Heart.

The apex and `www` are left out of the zone on purpose. Today they point at Heart's parked page,
which has no HTTPS, and #8 points them at CloudFront. Until then they won't resolve. So is
`ftp.harpguru.com` (`79.170.44.11`), which nothing uses. Heart also serves a wildcard,
`*.harpguru.com` to the parked address, so every made-up name resolves there, `webmail` and
`imap` included; and a `_domainconnect` TXT record, Heart's hook for letting third parties set
up DNS. Both are left behind too. Mail is forwarded, not kept in a mailbox, so nothing reads
mail through those names.

Checked 2026-10-27, before the switch:
- **DNSSEC is off**: `.com` holds no `DS` record for harpguru.com. Were it on, moving to
  unsigned nameservers would stop the whole domain resolving, with a two-day TTL on the way
  back.
- Heart serves no `TXT` at the apex and nothing at `_dmarc`, so there is no SPF, DKIM or DMARC
  to carry across.
- Route 53 answers `MX 10 mail.harpguru.com` and `mail A 79.170.44.72`, both with a one-hour TTL,
  as Heart does.

Step 3 done 2026-10-27: the baseline message arrived. Step 4's check the same day found nothing
on Heart's forwarding page about its nameservers. Its nameservers page warns that offsite
nameservers stop "features such as web forwarding and web hosting", which doesn't name mail
forwarding but doesn't rule it out, so step 5's test is what settles it. No DNSSEC setting in
the panel; the registration runs to September 2027.

Steps 4 and 5 done 2026-10-27, at about 21:00 UTC. A message from Hotmail, under three minutes
after the switch, arrived, but proves little: Heart's nameservers still answer for the domain
with the same `MX`, so a resolver that hasn't moved yet gets the same answer. Google's and
Cloudflare's public DNS already listed the Route 53 nameservers, so a message from a Gmail
address, which then arrived, took the new path. The wait was minutes, not the two days allowed.
By 2026-10-29 every resolver must have moved, since the `.com` delegation's TTL is two days.

**After the switch, `79.170.44.72` is ours to keep right.** Heart kept `mail.harpguru.com` up
to date in its own zone; from the switch on, it is a fixed value in `HarpguruDns`, and if Heart
moves its mail server, mail stops without anything saying so. Hence #6a.

Steps 1 and 2 done 2026-10-26, from the branch. The diff showed only the zone, the two record
sets and the output, all in the workload account. The deploy took about 90 seconds. Route 53
added the zone's own `NS` and `SOA` records, so it holds four record sets; asked directly with
`aws route53 test-dns-answer`, it answers the `MX` correctly. The public answer is still
Heart's, as expected. The `.com` zone hands out the delegation with a two-day TTL, so a
resolver may keep asking Heart for up to two days after the switch; allow that long for step 5.

**6a · `1-mail-canary`.** Not in the roadmap: added 2026-10-27 at the user's request, against
the silent failure above. One stack in the workload account, `HarpguruMailCanary`:
- **SES** sends as `canary@harpguru.com`. The domain is an SES identity with Easy DKIM, and CDK
  writes its three `CNAME` records into the zone. SES can only verify them once the public DNS
  answers from Route 53, so this deploys **after #6 has propagated**.
- **Two EventBridge Scheduler schedules**, Wednesdays at 09:00 London time, each calling SES's
  `SendEmail` directly as a universal target, with no Lambda:
  - one straight to the forwarding address, saying the other should be beside it
  - one to `contact@`, which arrives only if forwarding works

  Separate sends, not one message to both: Gmail can hide a second copy of a message it has
  already delivered, so a shared message's forwarded copy could be dropped, the very failure
  being looked for.
- **SES stays in its sandbox.** The sandbox sends only to verified identities, which the
  domain (covering `contact@`) and the forwarding address both are. No production access is
  requested.
- The forwarding address is `forwardingAddress` in `deploy.local.json`.
- The universal target's default permission would be `sesv2:sendEmail`, but IAM names SES's
  actions `ses:`, so the stack writes `ses:SendEmail` itself. It names the forwarding
  address's identity as well as the domain's, in case SES checks the recipient in the sandbox;
  that wasn't confirmed, and the first Wednesday is the test.
- Wednesdays, the user's choice on 2026-10-27, a Tuesday, so the first run came the next
  morning.
- `HarpguruDns` gains one output, the zone's ID, which the canary reads as a weak reference.
- Cost: SES charges about $0.10 per thousand messages; Scheduler's free tier covers this.

**What it doesn't catch:** a failure on the AWS side sends nothing at all, and a missing pair
is as easy to overlook as a missing single message. A CloudWatch alarm on Scheduler's
`TargetErrorCount`, emailing through SNS, would close that for about $0.10 a month; not built
yet.

Doing it, all *you*, once #6's step 5 shows the Route 53 nameservers:
1. `cdk diff HarpguruDns HarpguruMailCanary --profile harpguru`. `HarpguruDns` gains only the
   zone ID output; the canary is all `[+]`: two identities, three `CNAME` records, two
   schedules, and one role with its policy.
2. `cdk deploy HarpguruDns HarpguruMailCanary --profile harpguru --require-approval never`.
3. SES mails a verification link to the forwarding address. Click it.
4. `aws sesv2 get-email-identity --email-identity harpguru.com --profile harpguru --query '[VerifiedForSendingStatus,DkimAttributes.Status]'`
   shows `true` and `SUCCESS`, usually within minutes, up to 72 hours.
5. Optional, if the first Wednesday is days away: send the pair once by hand. This tests SES
   and the content, not the schedules' role:
   `aws scheduler get-schedule --name <name> --profile harpguru --query Target.Input --output text > /tmp/in.json && aws sesv2 send-email --cli-input-json file:///tmp/in.json --profile harpguru`,
   for each schedule, with names from `aws scheduler list-schedules --profile harpguru --query 'Schedules[].Name'`.
6. On the first Wednesday, both arrive. If not, `aws cloudwatch get-metric-statistics` on
   `AWS/Scheduler` `TargetErrorCount` says whether the role was refused.

Steps 1 to 4 done 2026-10-27, from the branch; step 5 skipped, since the first Wednesday was
the next morning. The diff showed only what step 1 lists, and the role's trust policy limited to
this account's `default` schedule group. The canary's deploy took about two and a half minutes.
Straight afterwards both identities showed `SUCCESS`, the domain's DKIM included, and the
account showed `ProductionAccessEnabled: false`, a 200-message daily quota.

Step 6 done 2026-10-28: both messages, "direct" and "via contact@", arrived just after
09:00 London time. So forwarding works through the new zone, and the schedules' role may send.
It doesn't settle whether SES checks the recipient's identity in the sandbox, since the policy
names both; that question stays open and harmless.

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
  the permission set. The Organization and the Identity Center instance stay outside, by
  choice: both existed before the app, nothing about them changes, and a stack owning them
  would carry a delete risk like the one designed out of `HarpguruPolicyTypes`. The anomaly
  monitor stays outside, as "Steps" item 2 says (planned 2026-09-25, against the account state
  checked 2026-09-26). The full list, with each "can't" and "chose
  not", is `docs/outside-cdk.md`.
- 2026-10-22: **the test for what goes in a stack: every piece of manual work is on record,
  and AWS defaults are left alone.** Configuration made by hand that may change goes into a
  stack where CloudFormation can manage it; a one-off foundation made by hand before the app,
  such as the Organization, is recorded in `docs/outside-cdk.md` instead, per the entry above;
  anything AWS made by itself is listed there and left alone. Under it,
  `OrganizationAccountAccessRole` and every default VPC stay outside. Both were briefly
  planned otherwise the same day, the role imported and the workload account's two default
  VPCs deleted, and dropped before anything ran: the deletion would itself have been manual
  work to record. One-off manual changes are logged at the end of `docs/outside-cdk.md`.
- 2026-10-22: **Resource Explorer, found switched on in the management account since
  2026-08-28, is kept and recorded in `docs/outside-cdk.md`**, not imported or switched off.
  It is a free, one-off console convenience made before the app.
- 2026-10-26: **the workload account's ID goes in `deploy.local.json`, and its stacks are
  pinned to it.** Until then every stack took its account from the signed-in profile, so a
  forgotten `--profile harpguru` would have deployed `HarpguruDns` to the management account.
  Now CDK refuses. Done before #7, which adds a second workload stack. The management stacks
  still follow the login; the reverse mistake, one of them deployed with `--profile harpguru`,
  is not guarded. Pinning them too would need the management account's ID as a second value,
  and only the workload side had a deploy coming that needed the guard. Seen working the same
  day: `cdk diff HarpguruDns`, signed in to the management account, printed no diff, only
  `Could not assume role in target account` for the workload account's
  `cdk-hnb659fds-lookup-role` and `cdk-hnb659fds-deploy-role`.
- 2026-10-27: **a weekly mail canary, #6a**, at the user's request: after the switch, Heart's
  mail server address is a fixed value in our zone, and a stale one would fail silently. SES
  and EventBridge Scheduler, with no Lambda, and SES left in its sandbox. Not in the roadmap,
  which it doesn't change: it is an operational check, not a product feature.
