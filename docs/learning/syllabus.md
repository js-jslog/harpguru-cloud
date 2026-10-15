# Syllabus

**As of 2026-10-15.** Covers Phase A steps 0–2: the SSO login, the CDK app skeleton, and the
$10 budget. Steps 1 and 2 are merged, and step 2 is **deployed**: `HarpguruBudget` is the
only stack of this project's running in the account. Check the
[status table](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/plans/phase-a.md#status)
for anything newer. Step 3 onward is not merged and is out of scope; see the last section.

Tiers are defined in the [agent prompt](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/learning/agent-prompt.md).
In short: **Must own** is what I should be able to defend unprompted. **Should understand**
is what I should follow. **Curiosity** is mine to explore at leisure. The tiering below is a
proposal, to be argued with.

Links to `aws-concepts.md` go to the entry for each concept. "Code" links are to files in `infra/`
(see the [README manifest](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/learning/README.md)
for full URLs).

---

## Must own

### 1. Identity: root, IAM Identity Center, and no IAM users

- **Core idea:** the root user signs in with the account's email address, can do everything,
  and is used for almost nothing; it has MFA. There are no IAM users and no access keys.
  Day-to-day access, in the console and the CLI, goes through IAM Identity Center: I sign in
  once at the access portal, and a **permission set** (`AdministratorAccess`) becomes a role in
  the account, giving me credentials that expire within hours.
- **Why it is must-own:** it is a security property I chose, and the most common way AWS
  credentials leak is a long-lived access key.
- **Be able to answer:** why short-lived credentials are safer than access keys; what a
  permission set is, and what it turns into inside an account; why the three-field sign-in page
  can never work for my Identity Center user, and which page does; what
  `aws sso login --use-device-code` does, and why the device-code flow is needed in this
  container.
- **Sources:** concepts [Root user](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#root-user),
  [IAM users](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#iam-users),
  [IAM Identity Center](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#iam-identity-center);
  `docs/aws-conventions.md` "First-run setup"; the findings doc's "AWS account state" section.

### 2. How CDK becomes AWS resources

- **Core idea:** CDK code synthesises a CloudFormation template. CloudFormation works out a
  **change set** against what is deployed and then applies it, recording each step as a stack
  event. `cdk diff` builds that change set without applying it. Resources are tracked by
  **logical ID**, so renaming one in code means replacing the real thing.
- **Why it is must-own:** reading a diff before every deploy is my safety check, and I have
  done one real deploy to reason from: `HarpguruBudget` on 2026-10-13.
- **Be able to answer:** walk through `cdk deploy` from source file to resource; what the
  `Monthly` logical ID and the `harpguru-monthly` physical ID are, and what renaming
  `'Monthly'` in the code would do; what app, stack and construct mean, and why stacks are split
  by lifecycle and location; what an L1 construct is and why the budget had to use one; how to
  find out why a failed deploy failed.
- **Sources:** concepts [CloudFormation and CDK](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cloudformation-and-cdk),
  [change sets, stack events and logical IDs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#change-sets-stack-events-and-logical-ids),
  [apps, stacks and constructs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#apps-stacks-and-constructs),
  [L1 and L2 constructs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#l1-and-l2-constructs);
  code `infra/bin/harpguru.ts` and `infra/lib/budget-stack.ts`.

### 3. Cost control as a design constraint

- **Core idea:** "budget alarm before the first deploy" is a locked decision, and it was kept:
  the budget was the first thing deployed. `harpguru-monthly` is $10 a month and alerts by
  email at 50, 80 and 100% of actual spend and at 100% of forecast. It lives in the management
  account, which pays every account's bill, so it covers the whole Organization. Budgets alert;
  they never stop spending. Cost Anomaly Detection runs separately and catches a sudden change
  in the rate of spending.
- **Why it is must-own:** it is the one control between a mistake and a bill, and it only
  works if I understand what it cannot do.
- **Be able to answer:** why the alarm came first; why a budget is not a cap, and why its alerts
  lag; why credits and refunds are excluded from it; why the console-made zero-spend budget was
  deleted rather than kept; what anomaly detection catches that a budget does not.
- **Sources:** concepts [Budgets](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#budgets),
  [Cost Anomaly Detection](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cost-anomaly-detection);
  `docs/orientation.md` "Where the money leaks"; `docs/plans/phase-a.md` step 2 and its
  decisions; code `infra/lib/budget-stack.ts`.

---

## Should understand

### 4. Regions, environments and bootstrap

- Most of the project lives in `eu-west-2`, but CloudFront's certificate must be issued in
  `us-east-1`. A CDK environment is an account plus a region; stacks are pinned to one, with the
  account taken from my SSO login rather than from the code. Bootstrap prepares one environment
  for CDK. The management account is bootstrapped in `eu-west-2` only.
- **Why not must-own:** it is mechanical. Know why the workload account will later need two
  bootstraps.
- **Sources:** concepts [Regions](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#regions),
  [Environments](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#environments),
  [CDK bootstrap](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cdk-bootstrap);
  `infra/lib/config.ts`.

### 5. Tags and cost allocation

- Tags are applied once at the app root, so every resource CDK can tag carries them. The budget
  is an exception: CDK's tagging does not reach it, so it sets its tags by hand, and a test
  checks they are there. A cost allocation tag must be activated in billing before cost reports
  can split costs by it, and only once a resource carries it.
- **Sources:** concept [Tags](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#tags-and-cost-allocation-tags);
  `infra/lib/tags.ts`, `infra/lib/budget-stack.ts`.

### 6. Testing infrastructure code

- Jest assertions run against the synthesised template, with no AWS access. They check what a
  stack would create, not that AWS will accept it.
- **Sources:** `infra/README.md`; `infra/test/budget-stack.test.ts`.

### 7. Account IDs, ARNs and keeping them out of a public repo

- What an ARN is made of; why an account ID is not a secret but is still kept out of the repo;
  how `deploy.local.json` and `CDK_DEFAULT_ACCOUNT` mean one is never committed.
- **Sources:** concept [Account ID and ARNs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#account-id-and-arns);
  `infra/README.md` "Deploy-time values"; `infra/lib/config.ts`.

---

## Curiosity

These are worth your time if they interest you. Skipping them leaves no gap.

- **CDK versus Terraform.** Why CDK is primary and Terraform is reserved for deliberate labs.
  `docs/aws-conventions.md` and the roadmap's decisions.
- **Why the repo must never gain harmonica domain code.** The boundary between this repo and
  the app. `docs/orientation.md`.
- **The toolchain.** Pinned versions, `tsx`, `@swc/jest`, pnpm, the devcontainer.
  `infra/README.md` and `docs/aws-conventions.md`.
- **How the project is run with a coding agent.** The working agreements in `CLAUDE.md`.

---

## Not yet built, so not for study

- **Step 3: the workload account, the `Workloads` OU and its SCPs.** Designed and coded, but
  not merged or deployed. The Organization itself exists, with only the management account in
  it. The concept entries for
  [Organizations](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#organizations),
  [OU](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#organizational-unit-ou)
  and [SCP](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#service-control-policy-scp)
  describe the plan for it. Read them as reading ahead; do not test me on them.
- CloudTrail, Config and GuardDuty (step 4); DNS, ACM, S3 and CloudFront (steps 6–8); and
  everything in phases B–F. Some of these also have concept entries already, for the same
  reason.
