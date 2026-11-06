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
| 4a | `1-org-trail`: the Organization trail and its bucket, in `HarpguruTrail` | **merged** and deployed 2026-10-30 | — |
| 4b | `1-config`: Config recorders in the workload account, and the SCP that protects them | **merged** and deployed 2026-10-30, after a first deploy rolled back; both regions' history files confirmed 2026-11-03 | — |
| 4c | `1-guardduty`: GuardDuty detectors in both accounts, both regions, emailing their findings, and the SCP that protects them | **merged** and deployed 2026-11-05; all four subscriptions confirmed | — |
| 5 | *you*: bootstrap the workload account | **done** 2026-10-22, both regions | — |
| 6 | `1-dns-zone`: hosted zone, then the nameserver switch at Heart | **done**: zone deployed 2026-10-26; switch made and mail tested 2026-10-27 | — |
| 6a | `1-mail-canary`: a weekly pair of messages showing `contact@` still forwards, in `HarpguruMailCanary` | **merged** and deployed 2026-10-27; first pair arrived 2026-10-28 | — |
| 7 | `1-certificate`: ACM in `us-east-1`, in `HarpguruCertificate` | **merged** and deployed 2026-11-06; certificate issued | — |
| 8 | `1-site`: bucket, CloudFront, landing page, `.well-known` | not started | #7, and the inputs below |

**Next up, as of 2026-11-06:**
1. #8, once the inputs below are in. The learning companion covers everything up to #7.
2. Optional, the user's call: deny `sns:SetSubscriptionAttributes` in
   `harpguru-protect-guardduty`. It is the one of its three gaps worth closing, found after
   the deploy; #4c says why.

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

**4 · audit: CloudTrail, Config, GuardDuty.** Planned as one branch, `1-org-audit`, and split
into three on 2026-10-27 (see Decisions), so each diff can be read in one sitting and each
brings its own concepts.

**4a · `1-org-trail`.** One stack in the management account, `HarpguruTrail`, termination
protected:
- An **organisation trail**, `harpguru-org-trail`: every account, every region, global service
  events included, management events only, with log file validation. The first copy of
  management events is free; data events, charged per event, are left off.
- A private bucket for it: public access blocked, SSE-S3 encryption, TLS only, `Retain`, and a
  lifecycle rule that deletes logs after 365 days. CloudTrail's own Event history already keeps
  90 days for free; the bucket is what lasts beyond that. No KMS key: $1 a month for nothing
  this project needs.
- The bucket policy, written by CDK, lets CloudTrail write under `AWSLogs/<org id>/`, so the
  Organization's ID joins `deploy.local.json` as `organizationId`.
  `scripts/identity-center-values.sh` now prints it.
- Both of the policy's `PutObject` statements carry an `aws:SourceArn` condition naming the
  trail. CDK's `Trail` puts one on the Organization's statement only; the management account's
  own, `AWSLogs/<account>/*`, would otherwise trust CloudTrail acting for any trail. The path
  already limits that, since CloudTrail writes under the trail's own account ID, so this is the
  second lock the CloudTrail guide recommends, not an open door. Found in the first `cdk diff`,
  2026-10-30, and added before the deploy by an escape hatch on the policy. *Corrected
  2026-10-30: this first said any account's trail could write there.*

**Trusted access comes first.** Organizations has to trust `cloudtrail.amazonaws.com` before an
org trail can be made through the API, and CloudFormation is the API. The console does this
itself; nothing else does
([CloudTrail guide](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-create-and-update-an-organizational-trail-by-using-the-aws-cli.html),
read 2026-10-27). It is a one-off CLI command, logged in `docs/outside-cdk.md`, rather than a
custom resource like `HarpguruPolicyTypes`: there is no resource type for it, and switching it
off would only stop new org trails being made.

Doing it, all *you*, signed in to the management account:
1. `scripts/identity-center-values.sh` and copy `organizationId` into `deploy.local.json`.
   Until it is there, every `cdk` command fails at synth, naming the key.
2. `aws organizations enable-aws-service-access --service-principal cloudtrail.amazonaws.com`.
   It prints nothing. `aws organizations list-aws-service-access-for-organization` should now
   list it beside `sso.amazonaws.com`. The Organizations guide says the management account
   should gain `AWSServiceRoleForCloudTrail` here too; in fact it arrives with the trail, in
   step 4.
3. `cdk diff HarpguruTrail`. It shows the bucket, its policy and the trail as `[+]`, in the
   management account, and IAM-style statements for the bucket policy.
4. `cdk deploy HarpguruTrail --require-approval never`.
5. `aws cloudtrail get-trail-status --name harpguru-org-trail --query IsLogging` is `true`.
   Within about 15 minutes, `aws s3 ls s3://<bucket>/AWSLogs/ --recursive | head` shows the
   first log files.

Done 2026-10-30, from the branch. What each step showed:
- Step 2: trusted access listed `cloudtrail.amazonaws.com` beside `sso.amazonaws.com`, but
  **`AWSServiceRoleForCloudTrail` did not appear.** It appeared ten minutes later, in the same
  second CloudFormation made the trail. So it's the trail that makes it, not trusted access.
- Step 3's first diff showed the unconditioned account statement above, fixed before going on.
  The second showed the condition on both `PutObject` rows, and nothing else changed.
- Step 4 took 27 seconds. The stack is `CREATE_COMPLETE` with termination protection on.
- Step 5: `IsLogging` was `true` straight away. In the same second as the trail, CloudTrail wrote
  empty `CloudTrail/` and `CloudTrail-Digest/` markers under both `AWSLogs/<management account>/`
  and `AWSLogs/<org id>/<management account>/`, so the account statement is used at creation,
  and its new condition let it through. **Every log file since, the management account's
  included, lands under `AWSLogs/<org id>/<account id>/CloudTrail/<region>/<yyyy>/<mm>/<dd>/`.**
  The first delivery was three minutes after the trail was made, and the workload account's
  first file came within seven. From the workload account, `describe-trails` returned nothing
  a minute after the deploy, and listed `harpguru-org-trail` as an organisation trail six
  minutes later.

**4b · `1-config`.** Config in the workload account only, in `eu-west-2` and `us-east-1`, as
two termination-protected stacks from one class, `ConfigStack`:
- **`HarpguruConfig`**, London: Config's service-linked role, `AWSServiceRoleForConfig`; one
  bucket for both regions, `harpguru-config-<account id>`; a recorder; and a delivery channel.
  The bucket is like the trail's: private, SSE-S3, TLS only, `Retain`, files deleted after 365
  days to match. Its policy follows the Config guide's, every grant conditioned on
  `AWS:SourceAccount`, the confused-deputy guard. It records IAM's global types, once.
- **`HarpguruConfigEdge`**, `us-east-1`: a recorder and a channel delivering to the London
  bucket, which it finds by name rather than a cross-region reference. It doesn't record IAM
  again. It does record Route 53 zones and, from #8, CloudFront distributions, which Config
  records only in `us-east-1`. It depends on `HarpguruConfig`, which deploys first.
- **Periodic (daily)** rather than continuous recording, of every supported type. Config charges
  for each change it records, so it is the item most likely to creep; a daily item is written
  only if the resource changed that day. No rules or conformance packs, which cost per
  evaluation.
- **Service-linked role, not a role of our own.** AWS maintains its permissions. It can't write
  to S3, so Config delivers as the `config.amazonaws.com` principal, and the bucket policy
  lets that in.
- **`harpguru-protect-config`**, a fourth SCP on `Workloads` in `HarpguruGuardrails`, moved here
  from #3 (see Decisions). It denies stopping, deleting or changing the recorder and channel,
  and changing which types are recorded. It exempts CDK's `cdk-hnb659fds-cfn-exec-role-*`, by
  `aws:PrincipalArn`, so a deploy can still change Config. That also bounds what it protects:
  an admin can still change Config by deploying through CDK. It guards against accidents and
  against credentials used outside CDK, not against the owner. It doesn't protect the bucket,
  which is retained and in a termination-protected stack.
- The CloudTrail half of that SCP is dropped. The org trail lives in the management account,
  where SCPs never apply, and a member account can't alter an org trail anyway.
- An assumption to check at the deploy: that a channel in `us-east-1` may deliver to a bucket
  in London. The Config guide's `AWS:SourceArn` format, one per region, implies it; nothing
  states it. CloudFormation does start the recorder itself, as CDK's docs say, but see below.

Doing it, all *you*. Config first, then the SCP, so the SCP can't get in the way of the first
deploy if its exemption were wrong:
1. `cdk diff HarpguruConfig HarpguruConfigEdge --profile harpguru`. London is all `[+]`: the
   role, the bucket and its policy, the recorder and the channel; `us-east-1` only a recorder
   and a channel. The policy shows as IAM-style statements, each with `AWS:SourceAccount`.
2. `cdk deploy HarpguruConfig HarpguruConfigEdge --profile harpguru --require-approval never`.
3. `aws configservice describe-configuration-recorder-status --profile harpguru` shows
   `recording: true`, `lastStatus: SUCCESS`, and the same with `--region us-east-1`. The agent
   can check this.
4. `cdk diff HarpguruGuardrails`, signed in to the management account, so no `--profile`. Only
   one new `[+]` policy, `harpguru-protect-config`, attached to `Workloads`.
5. `cdk deploy HarpguruGuardrails --require-approval never`.
6. The agent checks the SCP with the IAM policy simulator, which reads only: stopping a recorder
   should be denied by Organizations for the SSO role, and allowed for CDK's execution role.

**The first deploy failed, 2026-10-30, and rolled back.** The channel was made to wait for the
recorder, since a channel needs a recorder to exist. But CloudFormation's create of the recorder
isn't finished until the recorder has *started*, which needs the channel: CloudTrail showed
`PutConfigurationRecorder`, then nine minutes of `StartConfigurationRecorder` refused with
`NoAvailableDeliveryChannelException`, then "did not stabilize". `HarpguruConfigEdge` never
started. The fix, as in AWS's sample template, is no dependency between the two; in London both
wait for the service-linked role, so the channel can't run ahead of the recorder. The rollback
left `HarpguruConfig` empty in `ROLLBACK_COMPLETE`, termination protected, and the bucket,
`Retain`, empty, holding the name the next deploy needs. The role and the recorder went.

Clearing up before the retry, all *you*, in the workload account:
1. `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name HarpguruConfig --profile harpguru`
2. `aws cloudformation delete-stack --stack-name HarpguruConfig --profile harpguru`
3. `aws s3 rb s3://harpguru-config-$(aws sts get-caller-identity --profile harpguru --query Account --output text) --profile harpguru`,
   which refuses a bucket that isn't empty. It was empty on 2026-10-30.
4. Then steps 1 and 2 above again. The diff is unchanged but for the dependencies, which it
   doesn't show.

Done 2026-10-30, after the clear-up, which is logged in `docs/outside-cdk.md`. What it showed:
- The retry took 74 seconds in London and about 30 in `us-east-1`. Both stacks are
  `CREATE_COMPLETE` and protected, and both recorders show `recording: true`, `SUCCESS`.
- **The race is harmless.** In London the channel did run first, a second ahead of the recorder,
  and was refused with `NoAvailableConfigurationRecorderException`. Its handler retried 25
  seconds later and succeeded, and the recorder started two seconds after. So CloudFormation's
  channel handler retries; the recorder's start is what can't wait on a dependency.
- `us-east-1`'s channel was accepted with the London bucket, and wrote to it at once: each
  channel writes `AWSLogs/<account id>/Config/ConfigWritabilityCheckFile`, and the copy there was
  last written at 22:00:03 UTC, the second `HarpguruConfigEdge`'s channel was made (checked
  22:12 UTC). That was strong evidence, not yet a history file.
- **Both regions deliver history files**, checked 2026-11-03 with
  `aws s3 ls s3://harpguru-config-<account id>/AWSLogs/ --recursive --profile harpguru`. The
  bucket held 31 under `Config/eu-west-2/` and 33 under `Config/us-east-1/`, one per resource
  type, each covering 2026-10-30. The first arrived at 22:24 UTC that day from London and at
  01:54 UTC on 2026-10-31 from `us-east-1`, and the last on 2026-10-31. None has come since,
  which fits daily recording of an account where nothing has changed. Both recorders and both
  channels report `SUCCESS`, each channel's last success on 2026-11-03 itself.
- **Only `us-east-1` found the hosted zone**: `list-discovered-resources --resource-type
  AWS::Route53::HostedZone` lists `harpguru.com.` there and nothing in London. Otherwise the two
  regions recorded the same types, with three exceptions. London alone has `AWS::IAM::Role`, from
  the global types it records. `us-east-1` alone has `AWS::S3::StorageLens` and
  `AWS::IAM::SAMLProvider`, the one Identity Center made, though it doesn't record global types.
  So that flag doesn't cover every IAM type: the SAML provider is recorded in `us-east-1`, like
  the zone.
- `cdk diff HarpguruGuardrails` showed only the new policy. It also included the stack it
  depends on, `HarpguruPolicyTypes`, with no differences. The deploy used `--exclusively` to
  leave it out, and took 17 seconds.
- **The SCP works**, checked with `aws iam simulate-principal-policy`, which takes SCPs into
  account: for the SSO role, `config:StopConfigurationRecorder` and `config:PutDeliveryChannel`
  are `explicitDeny`, not allowed by Organizations, while `config:DescribeConfigurationRecorders`
  is allowed. For CDK's execution role all three are allowed.

**4c · `1-guardduty`.**
- A GuardDuty detector in each account, in both regions: four in all. The management account
  holds the Organization and the login, so it is watched too. Free for 30 days, then pennies.
- Standalone detectors, not GuardDuty managed through Organizations with a delegated
  administrator, which earns its keep with more than two accounts.
- Optional protection plans are left at their defaults unless one, seen after the deploy, has a
  cost worth questioning.
- **The management account needs `cdk bootstrap` in `us-east-1` first** (*you*). It had only
  `eu-west-2`. Done 2026-11-05.

Built as one `GuardDutyStack`, deployed four times, each termination protected, since deleting
a detector deletes its findings:

| Stack | Account | Region | Deployed with |
|---|---|---|---|
| `HarpguruGuardDutyManagement` | management | `eu-west-2` | the SSO login |
| `HarpguruGuardDutyManagementEdge` | management | `us-east-1` | the SSO login |
| `HarpguruGuardDutyWorkload` | workload | `eu-west-2` | `--profile harpguru` |
| `HarpguruGuardDutyWorkloadEdge` | workload | `us-east-1` | `--profile harpguru` |

Each holds:
- **The detector**, `AWS::GuardDuty::Detector`. The protection plans are left to GuardDuty, so
  they aren't in the template and **the diff can't show them**; which ones came on is checked
  after the deploy instead, with `aws guardduty get-detector`. None has anything to scan yet:
  there is no EC2, EKS, RDS or Lambda, and the S3 buckets see a few writes a day.
- **An email for every finding** (added 2026-11-03, see Decisions): an EventBridge
  rule, `harpguru-guardduty-findings`, matching every GuardDuty finding in that account and
  region, of any severity, and sending a few readable lines to an SNS topic of the same name,
  subscribed to the budget's `alertEmail`. A finding seen again is sent again, at most every six
  hours, GuardDuty's default. GuardDuty sends findings to EventBridge only in its own account
  and region, hence four rules and four topics, and **four subscriptions to confirm** by email.
  The topic lets EventBridge publish only for that rule, by `aws:SourceArn`; CDK's own statement
  allows any rule in any account. The subscription is made without CDK's `EmailSubscription`,
  which builds its logical ID from the address and so would print it in every diff.

And `HarpguruGuardrails` gains **`harpguru-protect-guardduty`**, a fifth SCP on `Workloads`, so
the workload account's detectors and alerts can only be changed by a CDK deploy, with the same
exemption as `harpguru-protect-config`. It denies deleting or updating the detector, which is
how one is suspended; creating or updating filters and trusted IP lists, the two ways to
silence findings without touching the detector; and deleting, disabling or retargeting the rule,
deleting or re-policying the topic, and unsubscribing from it. It doesn't cover the
unsubscribe link in each email, which needs no credentials, nor archiving a finding by hand,
nor `sns:SetSubscriptionAttributes`, with which a filter policy on the subscription could drop
every message (found by the 2026-11-05 learning dry run; not denied yet).
The management account's two stacks have no such guard: SCPs never apply there. An OU may have
ten SCPs attached; `Workloads` now has five of ours, six with `FullAWSAccess`.

`managementEnv()` takes a region now, as `workloadEnv()` does. Checked before the branch, on
2026-11-03: no detector in either account or region, no `AWSServiceRoleForAmazonGuardDuty` in
the management account, its London bootstrap untagged, version 32, and four of our SCPs on
`Workloads`, five with `FullAWSAccess`.

Doing it, all *you*, from `/app/infra`. GuardDuty first, then the SCP, as with Config, so the
SCP can't get in the way of the first deploy if its exemption were wrong:
1. Signed in to the management account: `A=$(aws sts get-caller-identity --query Account --output text) && npx cdk bootstrap aws://$A/us-east-1 -t project=harpguru -t repository=harpguru-cloud -t managed-by=cdk`
2. `npx cdk diff HarpguruGuardDutyManagement HarpguruGuardDutyManagementEdge`: each all `[+]`, a
   detector, a topic, its policy, a subscription and a rule. Then
   `npx cdk deploy HarpguruGuardDutyManagement HarpguruGuardDutyManagementEdge --require-approval never`.
3. The same two commands for `HarpguruGuardDutyWorkload HarpguruGuardDutyWorkloadEdge`, with
   `--profile harpguru`.
4. Confirm the four subscriptions from the emails, each headed "AWS Notification -
   Subscription Confirmation".
5. `npx cdk diff HarpguruGuardrails`, signed in to the management account: one new `[+]`
   policy, `harpguru-protect-guardduty`, attached to `Workloads`, and nothing else changed.
   Then `npx cdk deploy HarpguruGuardrails --exclusively --require-approval never`.
6. The agent checks the detectors, their plans, the subscriptions and the SCP, which
   `aws iam simulate-principal-policy` can test without attempting the calls.

Done 2026-11-05. What it showed:
- The bootstrap needed one retry: the first command, with `--tags` spelt out, was cut off after
  one, so CDK printed its help and made nothing. Step 1 is the shorter form that worked.
  `CDKToolkit` in `us-east-1` is version 32, like London's, and carries the project's three tags,
  which London's lacks.
- Every diff was as above: five `[+]` resources a stack, the one `sns:Publish` statement with its
  `aws:SourceArn` condition, and for `HarpguruGuardrails` one `[+]` policy, with
  `HarpguruPolicyTypes` included and unchanged. Each pair of GuardDuty stacks took about 170
  seconds, the guardrails 18.
- **All four detectors are `ENABLED`, with the same defaults**: CloudTrail, DNS and flow logs,
  S3 data events, EKS audit logs, EBS malware protection, RDS login events and Lambda network
  logs on; Runtime Monitoring, EKS Runtime Monitoring, AI Protection and AI Analyst off.
  A new finding goes to EventBridge within minutes; a repeat of one, every six hours. None of
  the plans that came on has anything here to scan but S3, so none is worth questioning. No
  findings yet.
- GuardDuty made **two** service-linked roles in each account, `AWSServiceRoleForAmazonGuardDuty`
  and `AWSServiceRoleForAmazonGuardDutyMalwareProtection`, the second for EBS malware protection.
  Logged in `docs/outside-cdk.md`.
- **The confirmation emails went to spam**, from `no-reply@sns.amazonaws.com`. All four were
  found there and confirmed. Marking that sender as not spam should keep real findings out of
  it, but only when done in Yahoo's own web client, as the sample findings below showed.
- **The SCP works.** `Workloads` has six SCPs, `FullAWSAccess` included. For the SSO role, `guardduty:DeleteDetector`,
  `UpdateDetector`, `CreateFilter` and `CreateIPSet`, `events:DisableRule` and `RemoveTargets` on
  the rule, and `sns:DeleteTopic` and `SetTopicAttributes` on the topic are all `explicitDeny`,
  not allowed by Organizations; `guardduty:GetDetector` and `ArchiveFindings` are allowed, as is
  `events:DisableRule` on any other rule. For CDK's execution role, all are allowed.
- **A finding reaches the inbox, or rather spam.** The owner made one sample finding in the
  workload account's London detector at 21:51 UTC, with
  `aws guardduty create-sample-findings --detector-id <id> --finding-types Recon:EC2/PortProbeUnprotectedPort --profile harpguru`.
  Its email arrived, in the format the rule writes, and in spam again, though earlier messages
  from that sender had been marked not spam in the owner's mail app. A second sample, of another
  type, at 22:05, went to spam too. Then one of them was marked not spam in Yahoo's own web
  client, and a third, `Recon:EC2/Portscan` at 22:08, **arrived in the inbox**. Each sample used
  a new type, since a repeat of a finding is only sent every six hours. A sample's title has no
  "[SAMPLE]" in it: GuardDuty marks samples in `Service.AdditionalInfo`, which the email leaves
  out. All three stay in the workload account's London detector, at severities 2, 2 and 5,
  until archived.

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
  parked web address the apex and `www` pointed at until the switch.
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

The apex and `www` are left out of the zone on purpose. Before the switch they pointed at
Heart's parked page, which has no HTTPS, and #8 points them at CloudFront. Since the switch they
don't resolve, and won't until #8. Nor does `ftp.harpguru.com` (`79.170.44.11`), which nothing
uses. Heart also served a wildcard,
`*.harpguru.com` to the parked address, so every made-up name resolved there, `webmail` and
`imap` included; and a `_domainconnect` TXT record, Heart's hook for letting third parties set
up DNS. Both are left behind too. Mail is forwarded, not kept in a mailbox, so nothing reads
mail through those names.

Checked 2026-10-27, before the switch:
- **DNSSEC is off**: `.com` holds no `DS` record for harpguru.com. Were it on, moving to
  unsigned nameservers would stop the whole domain resolving, with a two-day TTL on the way
  back.
- Heart serves no `TXT` at the apex or at `_dmarc` (its wildcard answers only `A`), so there is no SPF, DKIM or DMARC
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

The zone reaches the certificate the same way, the other way round: `HarpguruCertificate`
is passed `dns.zone`, and since references are weak, it reads the zone's ID from a plain
output of `HarpguruDns`, with `Fn::GetStackOutput` naming London. No custom resource and no
export. The output already exists: #6a's mail canary reads the same one for its DKIM
records, so `HarpguruDns` doesn't change, which `cdk diff` confirmed on 2026-11-06. `cdk
deploy HarpguruCertificate --profile harpguru` includes `HarpguruDns` as a dependency, finds
nothing to do there, and then waits while ACM validates: CloudFormation writes one `CNAME` per name into the zone and
the stack completes only once the certificate is issued. Those records are written by
CloudFormation, not declared as resources, so they appear in the zone but in no template;
`docs/outside-cdk.md` lists them. The stack is not termination protected: nothing in it is
hard to recreate, and once CloudFront uses the certificate, ACM refuses to delete it. Until
#8 nothing uses it, so ACM won't renew it, which is harmless with its expiry months away.

**Deployed 2026-11-06, from the branch.** `HarpguruDns` had no changes; the certificate was
issued about two and a half minutes after CloudFormation requested it, both names validated,
and the deploy took 161s. It is valid until 2027-05-23, 198 days, and ACM shows it as not in
use and `INELIGIBLE` for renewal until #8 attaches it. The two validation records are in the
zone, which now holds nine record sets. The template, as deployed, reads the zone's ID with
`Fn::GetStackOutput` naming `eu-west-2`, so the weak reference worked across regions.

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
    Lambda and its role go. Then the stack and the guardrails' `addStackDependency` on it come out of `infra/bin/harpguru.ts`. How
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
- 2026-10-27: **step 4 is three branches**, `1-org-trail`, `1-config` and `1-guardduty`, in that
  order, rather than one. The user's choice.
- 2026-10-27: **GuardDuty runs in both accounts**, as standalone detectors, rather than in the
  workload account only or through a delegated administrator. The user's choice.
- 2026-10-27: **the trail's logs are kept for a year**, then deleted by a lifecycle rule. The
  user's choice, over 90 days or forever.
- 2026-10-27: **trusted access for CloudTrail is a one-off CLI command**, logged in
  `docs/outside-cdk.md`, not a custom resource. See #4a. Proposed by the agent; easy to revisit,
  since the command is idempotent and a custom resource could adopt it later.
- 2026-10-27: **a weekly mail canary, #6a**, at the user's request: after the switch, Heart's
  mail server address is a fixed value in our zone, and a stale one would fail silently. SES
  and EventBridge Scheduler, with no Lambda, and SES left in its sandbox. Not in the roadmap,
  which it doesn't change: it is an operational check, not a product feature.
- 2026-10-30: **Config uses its service-linked role and one bucket, in London, for both
  regions**, with files kept for a year like the trail's. Proposed by the agent: the role is
  maintained by AWS, and a second bucket would hold nothing different. Easy to revisit: both
  are in `ConfigStack`, and the bucket is retained.
- 2026-11-03: **GuardDuty emails every finding, and a fifth SCP protects it**, both proposed by
  the agent and accepted by the user. Without the email, findings wait in the console for
  someone to look; without the SCP, the workload account's detectors could be suspended or
  silenced by anyone signed in. Easy to revisit: both are in their own resources.
- 2026-11-06: **the certificate takes the zone as a weak cross-region reference**, rather than
  a hosted zone ID written into the code or `deploy.local.json`, or a `fromLookup`, whose
  cached context would put the account ID in the repo. A zone ID kept by hand would be a
  second copy of a value `HarpguruDns` already owns, with nothing to say when the two
  differ. Proposed by the agent. The zone is
  retained and its ID never changes, so the reference locking nothing costs nothing. Easy to
  revisit: one prop in `infra/bin/harpguru.ts`.
