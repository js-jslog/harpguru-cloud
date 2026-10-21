# Syllabus

**As of 2026-10-21.** Covers Phase A steps 0–3: the SSO login, the CDK app skeleton, the $10
budget, and the workload account with its OU and guardrails, including step 3a, which switches
SCPs on through a custom resource. Steps 1 to 3a are merged. Only step 2 is **deployed**:
`HarpguruBudget` is the only stack of this project's running in the account. Step 3 is three
stacks of code, waiting on me to deploy them, and the status table in `docs/plans/phase-a.md`
says the same. Everything after step 3 is out of scope; see the last section.

**Priority now: topics 6 and 7.** On 2026-10-21 I settled the four step 3 decisions: I changed
one, so SCPs are now switched on by a custom resource, and confirmed the other three. What is
left before the deploy is understanding that custom resource, and the one step that cannot be
undone.

Each topic gives its tier and why, what I should be able to answer, and its sources. The
sources hold the facts; this file deliberately does not restate them. Sources are named by
path, as listed at the top of the README, and a quoted name is a heading inside that
file. Some concept entries describe step 3 as if it were deployed, for example in their "Say
it" lines; it is merged but not deployed, so teach it as code that will do this, not as what
the account does today. The tiers are defined
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

- **Covers:** the path from TypeScript to a running resource, through the one real deploy so
  far, `HarpguruBudget` on 2026-10-13.
- **Why must own:** reading a diff before every deploy is my safety check, and I can only read
  it if I know what CloudFormation will do with it.
- **Be able to answer:** walk through `cdk deploy` from source file to resource; what the
  budget's logical and physical IDs are, and what renaming its construct in the code would do;
  what app, stack and construct mean, and why stacks are split by lifecycle and location; what
  an L1 construct is and why the budget had to use one; how to find out why a deploy failed.
- **Sources:** `docs/aws-concepts.md` "CloudFormation and CDK",
  "Change sets, stack events and logical IDs", "Apps, stacks and constructs" and
  "L1 and L2 constructs"; `infra/bin/harpguru.ts`; `infra/lib/budget-stack.ts`.

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

- **Covers:** what step 3 will build: the Organization, a member account for the workload, the
  OU it sits in, and the three SCPs on that OU. Also what SCP, OU and ARN stand for.
- **Why must own:** keeping workloads out of the management account is a security property, and
  the SCPs are the guardrails I will rely on without seeing them work day to day.
- **Be able to answer:** what SCP and OU stand for, and what each is; why the workload goes in a
  member account rather than the management account; why an SCP grants nothing, and what
  `FullAWSAccess` is for; what each of the three SCPs denies, and why the region lock exempts
  some services; what happens to the new account's root user; why the account is created
  inside an OU that is already governed.
- **Sources:** `docs/aws-concepts.md` "Organizations", "Organizational Unit (OU)",
  "Service Control Policy (SCP)", "Root user" and "Account ID and ARNs";
  `docs/plans/phase-a.md` "Accounts" and "Steps" (item 3); `infra/lib/guardrails-stack.ts`;
  `infra/test/guardrails-stack.test.ts`.

### 5. The four step 3 decisions, and how I settled them

- **Covers:** four choices in step 3 that I accepted on 2026-10-14 without having studied them,
  and settled on 2026-10-21 after studying them:
  - how SCPs are switched on: **changed** from a one-off CLI command to a custom resource
  - the SCP protecting CloudTrail and Config moved to step 4: confirmed
  - the Identity Center and root identifiers kept in `deploy.local.json`, out of the repo:
    confirmed
  - centralised root access deferred to a later step: confirmed
- **Why must own:** they are my decisions, not the coding agent's, and I should be able to
  defend each one with a reason, including the one I changed against the agent's
  recommendation. Test my reasons; do not just restate them.
- **Be able to answer, for each one:** what was decided and what the alternative was; why I
  chose as I did; what it would take to change later, and what that would cost.
- **Sources:** `docs/plans/phase-a.md` "Decisions" (the entries dated 2026-10-14 and 2026-10-21)
  and "Steps" (items 3 and 4); `docs/aws-concepts.md` "Service Control Policy (SCP)",
  "Custom resources", "Root user", "CloudTrail" and "Config"; `infra/README.md`
  "Deploy-time values"; `infra/scripts/identity-center-values.sh`.

### 6. A custom resource that can never undo itself

- **Covers:** `HarpguruPolicyTypes`, the stack that switches SCPs on for the Organization's
  root, and the three layers that stop it ever switching them off.
- **Why must own:** switching SCPs off would detach every SCP in the Organization at once, so
  the design that prevents it is a security property I chose, and the stack is the first thing
  step 3 deploys.
- **Be able to answer:** what a custom resource is, and why one is needed here at all; what
  CloudFormation asks a custom resource to do on create, update and delete, and what this one
  does for each; what `Retain` changes about a delete; why it is a stack of its own, and why
  that stack is termination protected; what happens if SCPs were already switched on by hand;
  what its Lambda's role may call; what the agent's original alternative was, and what it would
  have saved.
- **Sources:** `docs/aws-concepts.md` "Custom resources" and
  "Deletion policy and termination protection"; `infra/lib/policy-types-stack.ts`;
  `infra/test/policy-types-stack.test.ts`; `infra/bin/harpguru.ts`; `docs/plans/phase-a.md`
  "Steps" (item 3) and "Decisions".

### 7. The point of no return

- **Covers:** why merging and most of the deploy can be undone, but the first
  `cdk deploy HarpguruAccounts` cannot, and what protects the account once it exists.
- **Why must own:** it is the one irreversible step in Phase A so far, and I am the one who runs
  it.
- **Be able to answer:** why merging the step 3 code changes nothing in AWS, and the one thing
  it does change locally; what makes creating
  an account hard to undo, including the 90 days and the account quota; why the account's
  name and email cannot be changed through CloudFormation afterwards, and how they still could
  be; why renaming the
  account's construct in the code would try to create a second account, and what in the repo
  guards against it; what `Retain` and termination protection each protect against.
- **Sources:** `docs/plans/phase-a.md` "Steps" (item 3) and "Decisions";
  `docs/aws-concepts.md` "Organizations", "Change sets, stack events and logical IDs" and
  "Deletion policy and termination protection"; `infra/lib/accounts-stack.ts`;
  `infra/test/accounts-stack.test.ts`; `infra/README.md` "Deploy-time values".

---

## Should understand

### 8. Regions, environments and bootstrap

- **Covers:** where things run, how a stack is pinned to an account and region without the
  account ID being in the code, and what bootstrap prepares.
- **Why not must own:** it is mechanical. Know why the workload account will later need two
  bootstraps.
- **Sources:** `docs/aws-concepts.md` "Regions", "Environments" and "CDK bootstrap";
  `infra/lib/config.ts`.

### 9. Tags and cost allocation

- **Covers:** tagging once at the app root, the budget's exception to it, and why a cost
  allocation tag needs activating.
- **Sources:** `docs/aws-concepts.md` "Tags and cost allocation tags" and
  "L1 and L2 constructs"; `infra/lib/tags.ts`; `infra/lib/budget-stack.ts`.

### 10. Testing infrastructure code

- **Covers:** what assertions against a synthesised template can and cannot prove, including a
  test that exists to stop an expensive mistake rather than to check behaviour, and tests that
  prove something is absent, such as a custom resource's delete call.
- **Sources:** `infra/README.md`; `infra/test/budget-stack.test.ts`;
  `infra/test/accounts-stack.test.ts`; `infra/test/guardrails-stack.test.ts`;
  `infra/test/policy-types-stack.test.ts`.

### 11. Account IDs, ARNs and keeping them out of a public repo

- **Covers:** what an ARN is made of, why an account ID is not a secret but is still kept out,
  and how the repo avoids ever committing one.
- **Sources:** `docs/aws-concepts.md` "Account ID and ARNs";
  `infra/README.md` "Deploy-time values"; `infra/lib/config.ts`.

### 12. Three stacks, cross-stack references and deploy order

- **Covers:** why step 3 is three stacks; how the OU's ID gets from the guardrails to the
  accounts stack, and how that forces the guardrails to deploy first; and how the guardrails
  are made to wait for `HarpguruPolicyTypes`, which they take no value from.
- **Sources:** `docs/aws-concepts.md` "Cross-stack references" and
  "Apps, stacks and constructs"; `docs/plans/phase-a.md` "Decisions" and "Steps" (item 3);
  `infra/bin/harpguru.ts`.

### 13. How I will get into the new account

- **Covers:** the Identity Center assignment that gives my existing login access to the new
  account, and `OrganizationAccountAccessRole` as the way back in if that ever breaks.
- **Sources:** `docs/aws-concepts.md` "IAM Identity Center" and
  "OrganizationAccountAccessRole"; `infra/lib/accounts-stack.ts`; `docs/plans/phase-a.md`
  "Steps" (item 3).

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

- **Deploying step 3.** The code is merged, but no OU, SCP or workload account exists yet, and
  SCPs are not yet switched on. The Organization holds only the management account.
- CloudTrail, Config and GuardDuty (step 4); bootstrapping the workload account (step 5); DNS,
  ACM, S3 and CloudFront (steps 6–8); and everything in phases B–F. Some of these already
  have concept entries, written ahead of the work; read them as reading ahead, and do not test
  me on them.
