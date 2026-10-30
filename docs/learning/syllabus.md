# Syllabus

**As of 2026-10-30.** Covers Phase A steps 0–6a, except step 4c: the SSO login, the CDK app
skeleton, the $10 budget, and the workload account with its OU and guardrails, including step
3a, which switches SCPs on through a custom resource, and step 3b, which imported the
console-made permission set into a stack and listed everything CDK doesn't manage. Step 1 is the
skeleton and deploys nothing itself; the rest are **deployed**: step 2 on 2026-10-13, and step
3's three stacks on 2026-10-22. Step 3b's `HarpguruIdentity` was imported and deployed, and step
5, bootstrapping the workload account in two regions, was done, both the same day.

Step 6 is **done**. The hosted zone, `HarpguruDns`, was deployed on 2026-10-26, and the
nameserver switch at Heart was made on 2026-10-27, with mail tested before and after: the
internet now asks Route 53 for harpguru.com, and `contact@` still forwards through Heart. Step
6a, the weekly mail canary `HarpguruMailCanary`, was **deployed** on 2026-10-27, and its first
pair of messages arrived on 2026-10-28.

Steps 4a and 4b are **merged and deployed**, both on 2026-10-30: the Organization trail,
`HarpguruTrail`, in the management account; and Config in the workload account, in two regions,
with a fourth SCP that protects it. Config's first deploy rolled back and was retried the same
day. One thing about it is still open: its first history files hadn't arrived when this was
written, though the `us-east-1` channel had already written a check file to the London bucket.
So the account really does hold the `Workloads` OU with four SCPs, the `harpguru` workload
account, a trail over both accounts, and Config recording daily. The status table in
`docs/plans/phase-a.md` says the same. Step 4c, GuardDuty, and steps 7 and 8 are not started;
see the last section.

**Priority now: topics 11 and 12**, the trail and Config, which watch the accounts. Then
topics 9 and 10 if they are still shaky.

Each topic gives its tier and why, what I should be able to answer, and its sources. The
sources hold the facts; this file deliberately does not restate them. Sources are named by
path, as listed in the README's sources, and a quoted name is a heading inside that
file. The tiers are defined
in the README, and the tiering here is a proposal, to be argued with.

---

## Must own

### 1. Identity: root, IAM Identity Center, and no IAM users

- **Covers:** who I am when I call AWS, and why no long-lived credentials exist anywhere.
- **Why must own:** it is a security property I chose, and long-lived access keys are the most
  common way AWS credentials leak.
- **Be able to answer:** what the root user is for here, and how it is protected; why
  short-lived credentials are safer than access keys; what a
  permission set is, and what it turns into inside an account; why the three-field sign-in page
  can never work for my Identity Center user, and which page does; what
  `aws sso login --use-device-code` does, and why the device-code flow is needed in this
  container.
- **Sources:** `docs/aws-concepts.md` "Root user", "IAM users" and "IAM Identity Center";
  `docs/aws-conventions.md` "First-run setup"; `roadmap-planning/aws-pathway-findings.md`
  "AWS account state, checked 2026-09-26".

### 2. How CDK becomes AWS resources

- **Covers:** the path from TypeScript to a running resource, through the first deploy,
  `HarpguruBudget` on 2026-10-13, and the step 3 deploy on 2026-10-22, whose first attempt
  failed and left an empty stack behind.
- **Why must own:** reading a diff before every deploy is my safety check, and I can only read
  it if I know what CloudFormation will do with it.
- **Be able to answer:** walk through `cdk deploy` from source file to resource; what the
  budget's logical and physical IDs are, and what renaming its construct in the code would do;
  what app, stack and construct mean, and why stacks are split by lifecycle and location; what
  an L1 construct is and why the budget had to use one; how to find out why a deploy failed;
  when a new stack starts to exist, and why the first step 3 deploy left an empty stack it
  could not delete; why `--require-approval never` is only safe once the diff has been read.
- **Sources:** `docs/aws-concepts.md` "CloudFormation and CDK",
  "Change sets, stack events and logical IDs", "Apps, stacks and constructs" and
  "L1 and L2 constructs"; `infra/bin/harpguru.ts`; `infra/lib/budget-stack.ts`;
  `docs/plans/phase-a.md` "Steps" (item 3, the paragraph after its numbered deploy steps);
  `roadmap-planning/aws-pathway-findings.md` "Step 3 deployed, 2026-10-22".

### 3. Cost control as a design constraint

- **Covers:** the budget, what it watches and what it can't do, and Cost Anomaly Detection
  alongside it.
- **Why must own:** it is the one control between a mistake and a bill, and it only works if I
  understand what it cannot do.
- **Be able to answer:** why the budget was this project's first deploy; why a budget is not a
  cap, and why its alerts lag; why one budget in the management account covers the whole
  Organization; why credits and refunds are excluded; why the console-made zero-spend budget
  was deleted rather than kept; what anomaly detection catches that a budget does not.
- **Sources:** `docs/aws-concepts.md` "Budgets" and "Cost Anomaly Detection";
  `docs/orientation.md` "Locked decisions you are most likely to trip over";
  `docs/plans/phase-a.md` "Steps" (item 2) and "Decisions"; `infra/lib/budget-stack.ts`.

### 4. The account structure and its guardrails

- **Covers:** what step 3 built and deployed: the Organization, a member account for the
  workload, the OU it sits in, and the SCPs on that OU: three from step 3, and a fourth from
  step 4b, which is topic 12's. Also what SCP, OU and ARN stand for.
- **Why must own:** keeping workloads out of the management account is a security property, and
  the SCPs are the guardrails I will rely on without seeing them work day to day.
- **Be able to answer:** what SCP and OU stand for, and what each is; why the workload goes in a
  member account rather than the management account; why an SCP grants nothing, and what
  `FullAWSAccess` is for; what each of step 3's three SCPs denies, and why the region lock exempts
  some services; why `us-east-1` is one of the two allowed regions; what happens to the new
  account's root user; why the account was created inside an OU that is already governed; how
  the region lock was seen working, and what the refusal said.
- **Sources:** `docs/aws-concepts.md` "Organizations", "Organizational Unit (OU)",
  "Service Control Policy (SCP)", "Root user", "Account ID and ARNs" and "Regions";
  `docs/plans/phase-a.md` "Accounts", "Steps" (item 3) and "Decisions" (the entry dated
  2026-10-14 about two stacks);
  `infra/lib/guardrails-stack.ts`; `infra/test/guardrails-stack.test.ts`;
  `roadmap-planning/aws-pathway-findings.md` "Step 3 deployed, 2026-10-22".

### 5. The four step 3 decisions, and how I settled them

- **Covers:** four choices in step 3 that I accepted on 2026-10-14 without having studied them,
  and settled on 2026-10-21 after studying them:
  - how SCPs are switched on: **changed** from a one-off CLI command to a custom resource
  - the SCP protecting CloudTrail and Config moved to step 4: confirmed, and built in step 4b
    without its CloudTrail half
  - the Identity Center and root identifiers kept in `deploy.local.json`, out of the repo:
    confirmed
  - centralised root access deferred to a later step: confirmed
- **Why must own:** they are my decisions, not the coding agent's, and I should be able to
  defend each one with a reason, including the one I changed against the agent's
  recommendation. Test my reasons; do not just restate them.
- **Be able to answer, for each one:** what was decided and what the alternative was; why I
  chose as I did; what it would take to change later, and what that would cost. For the moved
  SCP, also: why waiting for step 4 paid off, and why its CloudTrail half was dropped.
- **Sources:** `docs/plans/phase-a.md` "Decisions" (the entries dated 2026-10-14 and 2026-10-21)
  and "Steps" (items 3, 4 and 4b); `docs/aws-concepts.md` "Service Control Policy (SCP)",
  "Custom resources", "Root user", "CloudTrail" and "Config"; `infra/README.md`
  "Deploy-time values"; `infra/scripts/identity-center-values.sh`.

### 6. A custom resource that can never undo itself

- **Covers:** `HarpguruPolicyTypes`, the stack that switches SCPs on for the Organization's
  root, and the three layers that stop it ever switching them off.
- **Why must own:** switching SCPs off would detach every SCP in the Organization at once, so
  the design that prevents it is a security property I chose, and the stack is the first thing
  step 3 deploys. Know which of the three layers does the real work, and what the third adds.
- **Be able to answer:** what a custom resource is, and why one is needed here at all; what
  CloudFormation asks a custom resource to do on create, update and delete, and what this one
  does for each; what `Retain` changes about a delete; why it is a stack of its own, and why
  that stack is termination protected; what happens if SCPs were already switched on by hand;
  what the deploy's diff showed besides the custom resource, and why;
  what its Lambda's role may call; what the agent's original alternative was, and what it would
  have saved.
- **Sources:** `docs/aws-concepts.md` "Custom resources" and
  "Deletion policy and termination protection"; `infra/lib/policy-types-stack.ts`;
  `infra/test/policy-types-stack.test.ts`; `infra/bin/harpguru.ts`; `docs/plans/phase-a.md`
  "Steps" (item 3) and "Decisions".

### 7. The point of no return

- **Covers:** why merging and most of the deploy could be undone, but the first
  `cdk deploy HarpguruAccounts` could not, and what protects the account now that it exists.
  I ran it on 2026-10-22.
- **Why must own:** it is the one irreversible step in Phase A so far, I ran it, and the
  account it made is permanent.
- **Be able to answer:** why merging the step 3 code changed nothing in AWS, and the one thing
  it did change locally; what makes creating
  an account hard to undo, including the 90 days and the account quota; why the account's
  name and email cannot be changed through CloudFormation afterwards, and how they still could
  be; why renaming the
  account's construct in the code would try to create a second account, and what in the repo
  guards against it; what `Retain` and termination protection each protect against; how I
  checked afterwards that my login reaches the new account.
- **Sources:** `docs/plans/phase-a.md` "Steps" (item 3) and "Decisions";
  `docs/aws-concepts.md` "Organizations", "IAM Identity Center",
  "Change sets, stack events and logical IDs" and
  "Deletion policy and termination protection"; `infra/lib/accounts-stack.ts`;
  `infra/test/accounts-stack.test.ts`; `infra/README.md` "Deploy-time values";
  `roadmap-planning/aws-pathway-findings.md` "Step 3 facts, checked 2026-10-14 and 2026-10-20"
  and "Step 3 deployed, 2026-10-22".

### 8. What CDK doesn't manage, and how something gets in

- **Covers:** everything in the two accounts that no stack owns, each marked "can't", "chose
  not" or "not AWS"; the test that decides it, and the record of changes made by hand. Also
  resource import, which brought the console-made permission set and its management account
  assignment into `HarpguruIdentity`, and why that is a separate stack.
- **Why must own:** the stacks are only a full picture together with this list. I should be
  able to say, for anything in the accounts, whether code owns it, and if not, why not, without
  overstating a "chose not" as a "can't".
- **Be able to answer:** the test for what goes into a stack, and why AWS-made defaults are left
  alone; three things that can't be in CloudFormation, and why each can't; which items could be
  and were left out deliberately, and the reason for each; why the default VPCs were neither
  imported nor deleted, and why 15 of the workload account's can't even be touched; where a
  change made by hand is recorded; how an import differs from a create, why a diff can't confirm
  one, and what a plain deploy would have done; what an import does and doesn't change; why the
  project tags were left off for the import; what drift is, and how it was checked; why
  `HarpguruIdentity` is not part of `HarpguruPolicyTypes` or `HarpguruAccounts`.
- **Sources:** `docs/outside-cdk.md`; `docs/aws-concepts.md` "Resource import and drift",
  "Default VPC", "OrganizationAccountAccessRole" and "IAM Identity Center";
  `docs/plans/phase-a.md` "Steps" (item 3b) and "Decisions" (the two 2026-10-22 entries about
  what goes in a stack);
  `infra/lib/identity-stack.ts`; `infra/test/identity-stack.test.ts`;
  `infra/scripts/identity-import-mapping.sh`; `roadmap-planning/aws-pathway-findings.md`
  "Step 3 deployed, 2026-10-22".

### 9. Moving harpguru.com's DNS without breaking its mail

- **Covers:** the Route 53 hosted zone in the workload account; the records it carries and the
  ones left behind at Heart; and the nameserver switch, made on 2026-10-27, with the checks
  before it and the mail tests around it. Also what NS, SOA and TTL mean.
- **Why must own:** the switch was the first change in this project that could break something
  live: customers write to `contact@harpguru.com`. I made it by hand, in Heart's panel, with no
  diff to read first, so understanding was the only safety check, and it is the change I would
  have to reason about if mail ever stopped.
- **Be able to answer:** what a hosted zone is, and why it answered nothing until the switch;
  the difference between delegating a domain and transferring it, and why this project
  delegates; what an NS record is, and the two places one appears; what an SOA record is, and
  what it holds; why Route 53 shows four record sets when the code made two; what a TTL is, why
  the switch was allowed two days, and how long it actually took; why the `MX` and `mail` records
  had to be in the zone before the switch, and what would have happened to mail if they were
  not; what is deliberately left behind at Heart, including the wildcard, and why nothing is
  lost by it; why DNSSEC was the check that mattered most before the switch, and what was found;
  why the baseline mail test proved nothing about the new zone, why the Hotmail message after
  the switch proved little either, and why the Gmail one counted; whether Heart keeps
  forwarding with its nameservers moved away, and how that was settled; how I could see what the
  zone would answer before anything pointed at it; why the zone is `Retain` and its stack
  termination protected; why its `cdk` commands need `--profile harpguru`, and what happens
  without it; what the zone costs.
- **Sources:** `docs/aws-concepts.md` "Route 53 hosted zones and delegation" and
  "Environments"; `docs/plans/phase-a.md` "Status" and "Steps" (item 6);
  `infra/lib/dns-stack.ts`; `infra/test/dns-stack.test.ts`; `infra/bin/harpguru.ts`;
  `infra/README.md` "Deploy-time values"; `docs/outside-cdk.md`;
  `roadmap-planning/aws-pathway-findings.md` "harpguru.com, checked 2026-10-27, and the
  nameserver switch", "harpguru.com, re-checked 2026-10-26, and the hosted zone",
  "harpguru.com, re-checked 2026-09-25" and "harpguru.com, checked 2026-08-31".

### 10. The weekly mail canary, and the failure it watches for

- **Covers:** why the switch left a way for mail to stop silently, and step 6a's answer: every
  Wednesday at 09:00 London time, one message straight to my forwarding address and one to
  `contact@`, sent by SES from EventBridge Scheduler. What it catches, and what it doesn't.
- **Why must own:** it is a decision I asked for, against a risk the switch created, and it is
  now the only thing that tells me `contact@` works. I should be able to say what each missing
  message would mean, and where it leaves me blind.
- **Be able to answer:** what Heart used to keep right that is now a fixed value in my zone, and
  what happens to mail if Heart moves its mail server; why two messages, and why two separate
  sends rather than one message to both addresses; what it means if only the direct one
  arrives, and if neither does; why Wednesday; why SES stays in its sandbox, and why that is
  enough here; why there is no Lambda; what the canary doesn't catch, what would close the gap,
  and whether that is built; what the first Wednesday showed, and the one question it left open.
- **Sources:** `docs/plans/phase-a.md` "Steps" (item 6, its bold paragraph "After the switch,
  `79.170.44.72` is ours to keep right", and item 6a) and "Decisions" (the 2026-10-27 entry about the canary);
  `infra/lib/mail-canary-stack.ts`; `docs/aws-concepts.md` "SES identities, the sandbox and DKIM"
  and "EventBridge Scheduler and universal targets";
  `roadmap-planning/aws-pathway-findings.md` "harpguru.com, checked 2026-10-27, and the
  nameserver switch".

### 11. The Organization trail: who did what, kept for a year

- **Covers:** step 4a's `HarpguruTrail`: one CloudTrail trail in the management account covering
  every account and region, its bucket and the policy that lets CloudTrail write to it, and the
  trusted access switched on by hand first.
- **Why must own:** it is the record I would turn to after anything went wrong, and its design
  is a set of security and cost choices: where it lives, what it records, how long it keeps
  logs, and who may write to its bucket.
- **Be able to answer:** what CloudTrail records, and what Event history already gives for free
  without a trail; why one organisation trail in the management account rather than a trail in
  each account, and why no SCP protects it; what "management events only" leaves out, and why;
  what log file validation proves; why logs are kept a year, and what deletes them; why there is
  no KMS key; what trusted access is, why it had to be switched on by hand, and what it did and
  didn't create; what the bucket policy lets CloudTrail do; what `aws:SourceArn` adds, which
  statement CDK left without it, and why that was a missing second lock rather than an open
  door; where each account's logs land under `AWSLogs/`; how soon the first logs arrived, and
  when the workload account could see the trail.
- **Sources:** `docs/aws-concepts.md` "CloudTrail", "Trusted access" and
  "S3 buckets, bucket policies and lifecycle rules"; `docs/plans/phase-a.md` "Steps" (items 4
  and 4a) and "Decisions" (the 2026-10-27 entries about the trail's logs and trusted access);
  `infra/lib/trail-stack.ts`; `infra/test/trail-stack.test.ts`; `docs/outside-cdk.md`;
  `roadmap-planning/aws-pathway-findings.md` "Step 4a deployed: the Organization trail,
  2026-10-30".

### 12. Config, and the SCP only a deploy can get past

- **Covers:** step 4b: Config recording daily in the workload account, in London and
  `us-east-1`, delivering to one bucket; and `harpguru-protect-config`, the SCP that stops
  anyone turning it off except CloudFormation acting for a CDK deploy.
- **Why must own:** the SCP's exemption is a security design whose limits I should state
  unprompted, and daily recording is a cost decision against the service most likely to creep.
- **Be able to answer:** what Config records that CloudTrail doesn't; why daily rather than continuous recording, and what that changes about cost; why
  two regions, why IAM is recorded only in London, and what only `us-east-1` can record; why one
  bucket, and how the `us-east-1` stack finds it; what the SCP denies, whom it exempts and how,
  and therefore what it doesn't protect against; why the trail needs no such SCP; how the SCP
  was shown to work without trying to stop a recorder; what was still open after the deploy,
  and what evidence there already is.
- **Sources:** `docs/aws-concepts.md` "Config" and "Service Control Policy (SCP)";
  `docs/plans/phase-a.md` "Steps" (item 4b) and "Decisions" (the 2026-10-14 entry about the
  CloudTrail/Config SCP, and the 2026-10-30 entry); `infra/lib/config-stack.ts`;
  `infra/lib/guardrails-stack.ts`; `infra/test/guardrails-stack.test.ts`;
  `roadmap-planning/aws-pathway-findings.md` "Step 4b deployed: Config in the workload account,
  2026-10-30".

---

## Should understand

### 13. Regions, environments and bootstrap

- **Covers:** where things run, how a stack is pinned to an account and region without the
  account ID being in the code, and what bootstrap prepares.
- **Why not must own:** it is mechanical. Know why the workload account needed two
  bootstraps, one of them in `us-east-1`, and what the certificate has to do with it; and
  what the two defaults kept at bootstrap mean, in particular who is in effect an admin of the
  account. Also why the workload account's stacks are pinned to an account ID kept in
  `deploy.local.json`, while the management account's follow the login; what happens when I
  forget `--profile harpguru` for a workload stack, and which mistake is still not caught; and
  how `HarpguruConfigEdge` is pinned to the same account in `us-east-1`.
- **Sources:** `docs/aws-concepts.md` "Regions", "Environments" and "CDK bootstrap";
  `infra/lib/config.ts`; `infra/bin/harpguru.ts`; `docs/plans/phase-a.md` "Steps" (item 5) and "Decisions" (the
  2026-10-26 entry).

### 14. Tags and cost allocation

- **Covers:** tagging once at the app root, the budget's exception to it, and why a cost
  allocation tag needs activating.
- **Sources:** `docs/aws-concepts.md` "Tags and cost allocation tags" and
  "L1 and L2 constructs"; `infra/lib/tags.ts`; `infra/lib/budget-stack.ts`.

### 15. Testing infrastructure code

- **Covers:** what assertions against a synthesised template can and cannot prove, including a
  test that exists to stop an expensive mistake rather than to check behaviour, and tests that
  prove something is absent, such as a custom resource's delete call. Also why every test
  builds its app with `cdk.json`'s feature flags: until 2026-10-22 they did not, and the
  cross-stack test passed while asserting an export the deployed app never used. And two tests
  added after something went wrong or nearly did: one pinning an escape hatch to the policy
  statement it edits, and one forbidding the dependency that deadlocked Config's first deploy.
- **Sources:** `infra/README.md`; `infra/test/app.ts`; `infra/test/budget-stack.test.ts`;
  `infra/test/accounts-stack.test.ts`; `infra/test/guardrails-stack.test.ts`;
  `infra/test/policy-types-stack.test.ts`; `infra/test/trail-stack.test.ts`;
  `infra/test/config-stack.test.ts`.

### 16. Account IDs, ARNs and keeping them out of a public repo

- **Covers:** what an ARN is made of, why an account ID is not a secret but is still kept out,
  and how the repo avoids ever committing one.
- **Sources:** `docs/aws-concepts.md` "Account ID and ARNs";
  `infra/README.md` "Deploy-time values"; `infra/lib/config.ts`.

### 17. Three stacks, cross-stack references and deploy order

- **Covers:** why step 3 is three stacks; how the OU's ID gets from the guardrails to the
  accounts stack, and how that forces the guardrails to deploy first; and how the guardrails
  are made to wait for `HarpguruPolicyTypes`, which they take no value from. Also the
  difference between a strong and a weak reference, which one this repo uses, and what
  therefore protects the guardrails stack instead. Also how `HarpguruConfigEdge`, in another
  region, reaches the London bucket with no reference at all, and is made to deploy second.
- **Sources:** `docs/aws-concepts.md` "Cross-stack references" and
  "Apps, stacks and constructs"; `docs/plans/phase-a.md` "Decisions" and "Steps" (items 3 and
  4b); `infra/bin/harpguru.ts`; `infra/lib/config-stack.ts`.

### 18. How I get into the new account

- **Covers:** the Identity Center assignment that gives my existing login access to the new
  account, the second CLI profile that uses it, and `OrganizationAccountAccessRole` as the way
  back in if that ever breaks.
- **Sources:** `docs/aws-concepts.md` "IAM Identity Center" and
  "OrganizationAccountAccessRole"; `infra/lib/accounts-stack.ts`; `docs/plans/phase-a.md`
  "Steps" (item 3).

### 19. SES and Scheduler, the mechanics

- **Covers:** how the canary is wired: the domain and the forwarding address as SES identities,
  Easy DKIM's three records written into the zone, the universal target that calls SES's
  `SendEmail` with no code, and the IAM action name CDK gets wrong. Also how the canary finds
  the zone, through `HarpguruDns`'s new output, read as a weak reference.
- **Why not must own:** the decisions are topic 10's; this is how they are carried out. Know
  what DKIM proves to a receiving server; why the domain identity covers `contact@` but my own
  address needed a click; why the stack writes `ses:SendEmail` rather than accept CDK's
  `sesv2:sendEmail`, and which test guards it; why the schedule names a time zone; and why the
  canary had to deploy after the switch had propagated.
- **Sources:** `docs/aws-concepts.md` "SES identities, the sandbox and DKIM", "EventBridge
  Scheduler and universal targets", and "Cross-stack references" for what a weak
  reference is; `infra/lib/mail-canary-stack.ts`; `infra/test/mail-canary-stack.test.ts`;
  `infra/bin/harpguru.ts`; `docs/plans/phase-a.md` "Steps" (item 6a); `docs/outside-cdk.md`
  "Workload account `harpguru`".

### 20. Service principals, service-linked roles and the confused deputy

- **Covers:** how an AWS service is let into my resources: a service-linked role it acts as
  inside the account, or a bucket policy granting its service principal; and the conditions
  that keep a grant to a service from being used on someone else's behalf.
- **Why not must own:** the security decisions are topics 11 and 12's; this is the mechanism
  under both. Know what a service-linked role is and who can change it; which ones arrived on
  their own and which one a stack created; why Config's role can't deliver to S3, and how Config
  delivers instead; what `aws:SourceArn` and `AWS:SourceAccount` each narrow a grant to, and
  which bucket uses which.
- **Sources:** `docs/aws-concepts.md` "Service-linked roles" and
  "S3 buckets, bucket policies and lifecycle rules"; `infra/lib/config-stack.ts`;
  `infra/lib/trail-stack.ts`; `docs/outside-cdk.md`.

### 21. When a deploy rolls back: Config's deadlock

- **Covers:** Config's first deploy on 2026-10-30, which waited nine minutes, failed and rolled
  back; how the cause was found; the fix; and the clear-up the rollback left.
- **Why not must own:** it is a lesson in reading failures, not a design I defend. Know what
  "did not stabilize" meant here, and how CloudTrail showed the cause; why the channel mustn't
  wait for the recorder, though Config's docs say a channel needs a recorder first; why the
  retry still raced, and why that was harmless; what the rollback left behind, and why a fixed
  name on a retained bucket made the clear-up necessary; where that clear-up is recorded; and
  which test stops the deadlock coming back.
- **Sources:** `docs/plans/phase-a.md` "Steps" (item 4b); `docs/aws-concepts.md` "Config" and
  "Deletion policy and termination protection"; `infra/lib/config-stack.ts`;
  `infra/test/config-stack.test.ts`; `docs/outside-cdk.md` "Changes made outside CDK";
  `roadmap-planning/aws-pathway-findings.md` "Step 4b deployed: Config in the workload account,
  2026-10-30".

---

## Curiosity

These are worth your time if they interest you. Skipping them leaves no gap.

- **CDK versus Terraform.** `docs/aws-conventions.md`, and `roadmap-planning/roadmap.md`
  "Locked decisions".
- **Why the repo must never gain harmonica domain code.** `docs/orientation.md`.
- **The toolchain**: the pinned CDK CLI, `tsx`, Jest, pnpm, the devcontainer.
  `infra/README.md`, `docs/plans/phase-a.md` "Steps" (item 1) and `docs/aws-conventions.md`.
- **How the project is run with a coding agent.** `CLAUDE.md`.

---

## Not yet built, so not for study

- GuardDuty (step 4c); ACM, S3 for the site and CloudFront (steps 7 and 8); the CloudWatch alarm
  that would catch the canary failing on the AWS side; and everything in phases B–F. Some of
  these already have concept entries, written ahead of the work; read them as reading ahead,
  and do not test me on them.
