# Syllabus

**As of 2026-10-15.** Covers Phase A steps 0–3: the CDK app, the budget, and the Workloads OU,
SCPs and `harpguru` account. Step 3 is pushed but not yet deployed at this date; check the
[status table](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/plans/phase-a.md#status)
for what is live. Steps 4 onward do not exist yet and are out of scope.

Tiers are defined in the [agent prompt](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/learning/agent-prompt.md).
In short: **Must own** is what I should be able to defend unprompted. **Should understand**
is what I should follow. **Curiosity** is mine to explore at leisure. The tiering below is a
proposal, to be argued with.

Links to `aws-concepts.md` go to the entry for each concept. "Code" links are to files in `infra/`
(see the [README manifest](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/learning/README.md)
for full URLs).

---

## Must own

### 1. The account structure, and why workloads are not in the management account

- **Core idea:** an AWS Organization holds a management account, which controls billing and
  the Organization itself, and member accounts, which run things. Here the management account
  holds Identity Center, budgets and (later) the org trail. Everything serving harpguru.com
  goes in a separate `harpguru` workload account inside a `Workloads` OU.
- **Why it is must-own:** the reason is a security property, not tidiness. SCPs never apply to
  the management account, so anything running there is outside the guardrails.
- **Be able to answer:** what an account boundary gives you that IAM policies in one account do
  not; why the account is created inside an already-governed OU; why the account resource is
  `RETAIN`.
- **Sources:** concepts [Organizations](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#organizations),
  [OU](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#organizational-unit-ou),
  [OrganizationAccountAccessRole](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#organizationaccountaccessrole);
  plan section "Accounts" and step 3 in `docs/plans/phase-a.md`; code `infra/lib/accounts-stack.ts`.

### 2. Service Control Policies

- **Core idea:** an SCP sets the maximum permissions available in an account. It never grants
  anything; it only limits what other policies can grant. Three are attached here: region lock,
  deny-root and deny-leave-org.
- **Be able to answer:** why a region lock needs an exemption list for global services, and why
  the list matches AWS's own example; what `FullAWSAccess` is and why it matters during
  enablement; why SCPs are enabled with a one-off CLI command rather than a CloudFormation
  custom resource (see the 2026-10-14 decision: deleting that resource would disable SCPs
  across the whole Organization).
- **Sources:** concept [SCP](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#service-control-policy-scp);
  `docs/plans/phase-a.md` step 3 and its decisions; code `infra/lib/guardrails-stack.ts` and
  its test.

### 3. Identity: root, IAM Identity Center, and no IAM users

- **Core idea:** the root user is for almost nothing and is denied by SCP in the workload
  account. Day-to-day access is through IAM Identity Center, which issues short-lived
  credentials through SSO login, using permission sets assigned to a user and an account.
  There are no long-lived IAM user keys.
- **Be able to answer:** why short-lived credentials are safer than access keys; what a
  permission set is and how an assignment connects a user, a permission set and an account;
  what an organization instance of Identity Center is.
- **Sources:** concepts [Root user](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#root-user),
  [IAM users](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#iam-users),
  [IAM Identity Center](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#iam-identity-center);
  `docs/aws-conventions.md` on credentials; `infra/lib/accounts-stack.ts`.

### 4. How CDK becomes AWS resources

- **Core idea:** CDK code synthesises a CloudFormation template; CloudFormation computes a
  change set against what is deployed and applies it. `cdk diff` shows that change set before
  anything happens. Resources are tracked by logical ID, so renaming one in code means
  replacing it.
- **Be able to answer:** walk through `cdk deploy` from source file to resource; what a
  logical ID is and why changing it can destroy something; what an app, a stack and a
  construct are; what the difference is between an L1 and an L2 construct and when you would
  drop to L1.
- **Sources:** concepts [CloudFormation and CDK](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cloudformation-and-cdk),
  [change sets](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#change-sets-stack-events-and-logical-ids),
  [apps, stacks and constructs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#apps-stacks-and-constructs),
  [L1 and L2](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#l1-and-l2-constructs);
  `infra/bin/harpguru.ts` and the three stacks.

### 5. Protecting things from your own mistakes

- **Core idea:** termination protection stops a stack being deleted; a deletion policy decides
  what happens to a resource when its stack is deleted or the resource is removed from
  the template; cross-stack references order deployment and also make a dependency permanent.
- **Be able to answer:** why the account is `RETAIN` and what 90 days has to do with it; why
  the OU ID arrives as a cross-stack import and what that guarantees about deploy order; what
  stops you deleting an exported value that another stack uses.
- **Sources:** concepts [deletion policy and termination protection](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#deletion-policy-and-termination-protection),
  [cross-stack references](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cross-stack-references);
  code `infra/lib/accounts-stack.ts` and `guardrails-stack.ts`.

### 6. Cost control as a design constraint

- **Core idea:** the budget was deployed before anything else, as a locked decision. Budgets
  alert on actual and forecast spend; Cost Anomaly Detection is separate and catches unusual
  patterns; neither stops spending.
- **Be able to answer:** why the alarm came first; what a budget cannot do; why the console-made
  zero-spend budget was deleted rather than kept (it would fire monthly once a hosted zone
  exists).
- **Sources:** concepts [Budgets](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#budgets),
  [Cost Anomaly Detection](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cost-anomaly-detection);
  `docs/orientation.md` "Where the money leaks"; code `infra/lib/budget-stack.ts`.

---

## Should understand

### 7. Environments and bootstrap

- An environment is an account plus a region. CDK bootstrap prepares one with the roles and
  bucket CDK needs. Each account and region you deploy into needs its own bootstrap.
- **Why not must-own:** it is mechanical, but you should know why the workload account will need
  it twice (`eu-west-2` and `us-east-1`).
- **Sources:** concepts [Environments](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#environments),
  [CDK bootstrap](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#cdk-bootstrap),
  [Regions](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#regions);
  `infra/lib/config.ts`.

### 8. Tags and cost allocation

- Tags are applied once at the app root so every resource carries them. A cost allocation tag
  must be activated in the billing console before it shows up in cost reports, and only once a
  resource carries it.
- **Sources:** concept [Tags](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#tags-and-cost-allocation-tags);
  `infra/lib/tags.ts`, `infra/bin/harpguru.ts`.

### 9. Testing infrastructure code

- Jest assertions run against the synthesised template, without AWS access. They check what
  the stack would create, not that AWS accepts it.
- **Sources:** `infra/README.md`; any file under `infra/test/`.

### 10. Account IDs, ARNs and keeping them out of a public repo

- What an ARN is made of; why the account ID is not a secret but is still kept out; how the
  deploy-time values file and `CDK_DEFAULT_ACCOUNT` avoid ever committing one.
- **Sources:** concept [Account ID and ARNs](https://github.com/js-jslog/harpguru-cloud/blob/master/docs/aws-concepts.md#account-id-and-arns);
  `infra/README.md` "Deploy-time values"; `infra/lib/config.ts`.

---

## Curiosity

These are worth your time if they interest you. Skipping them leaves no gap.

- **CDK versus Terraform.** Why CDK is primary and Terraform is reserved for deliberate labs.
  `docs/aws-conventions.md` and the roadmap's decisions.
- **Why the repo must never gain harmonica domain code.** The architectural boundary between
  this repo and the app. `docs/orientation.md`.
- **Centralised root access.** Deferred to a step of its own; see the plan's decisions.
- **The toolchain.** Pinned versions, `tsx`, `@swc/jest`, pnpm, the devcontainer. Root `README.md`
  and `infra/README.md`.
- **How the project is run with a coding agent.** The working agreements in `CLAUDE.md`.

---

## Not yet built, so not for study

CloudTrail, Config and GuardDuty (step 4), DNS, ACM, S3 and CloudFront (steps 6–8), and
everything in phases B–F. `docs/aws-concepts.md` already has entries for some of these because
they were written ahead of the work; treat them as reading ahead, not as material to be tested on.
