# Syllabus

**As of 2026-10-18.** Covers Phase A steps 0–2: the SSO login, the CDK app skeleton, and the
$10 budget. Steps 1 and 2 are merged, and step 2 is **deployed**: `HarpguruBudget` is the
only stack of this project's running in the account. Step 3 is coded on its branch but not
merged or deployed, and the status table in `docs/plans/phase-a.md` says the same. It and
everything after it are out of scope; see the last section.

Each topic gives its tier and why, what I should be able to answer, and its sources. The
sources hold the facts; this file deliberately does not restate them. Sources are named by
path, as listed at the top of the README, and a quoted name is a heading inside that
file. Some concept entries describe step 3 as if it were done, for example in their "Say it"
lines; check them against the status table before teaching them as fact. The tiers are defined
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
  "AWS account state".

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

---

## Should understand

### 4. Regions, environments and bootstrap

- **Covers:** where things run, how a stack is pinned to an account and region without the
  account ID being in the code, and what bootstrap prepares.
- **Why not must own:** it is mechanical. Know why the workload account will later need two
  bootstraps.
- **Sources:** `docs/aws-concepts.md` "Regions", "Environments" and "CDK bootstrap";
  `infra/lib/config.ts`.

### 5. Tags and cost allocation

- **Covers:** tagging once at the app root, the budget's exception to it, and why a cost
  allocation tag needs activating.
- **Sources:** `docs/aws-concepts.md` "Tags and cost allocation tags" and
  "L1 and L2 constructs"; `infra/lib/tags.ts`; `infra/lib/budget-stack.ts`.

### 6. Testing infrastructure code

- **Covers:** what assertions against a synthesised template can and cannot prove.
- **Sources:** `infra/README.md`; `infra/test/budget-stack.test.ts`.

### 7. Account IDs, ARNs and keeping them out of a public repo

- **Covers:** what an ARN is made of, why an account ID is not a secret but is still kept out,
  and how the repo avoids ever committing one.
- **Sources:** `docs/aws-concepts.md` "Account ID and ARNs";
  `infra/README.md` "Deploy-time values"; `infra/lib/config.ts`.

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

- **Step 3: the workload account, the `Workloads` OU and its SCPs.** Coded on its branch, not
  merged or deployed. The Organization itself exists, with only the management account in it.
  The "Organizations", "Organizational Unit (OU)" and "Service Control Policy (SCP)" entries in
  `docs/aws-concepts.md` describe the plan for it. Read them as reading ahead; do not test me on
  them.
- CloudTrail, Config and GuardDuty (step 4); DNS, ACM, S3 and CloudFront (steps 6–8); and
  everything in phases B–F. Some of these also have concept entries already, for the same
  reason.
