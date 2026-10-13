# AWS concepts, as this project meets them

A study companion rather than a reference. Each entry covers an AWS concept at the point
where this project uses it, and says why it matters here. It grows with the work: **a PR
that introduces a concept adds its entry in that same PR.**

Each entry has four lines:

- **What:** the concept, in plain terms.
- **Here:** how this project uses it, and which step of the phase plan introduces it.
- **Say it:** one sentence worth being able to say in an interview.
- **See it:** a read-only command to look at the real thing. Run these; seeing the actual
  resource is what makes the concept stick.

The "See it" commands assume you are signed in with `aws sso login`. Where a command needs
the account ID, it fetches it with `aws sts get-caller-identity`.

**Index:** [Regions](#regions) · [Account ID and ARNs](#account-id-and-arns) ·
[Root user](#root-user) · [IAM users](#iam-users) ·
[IAM Identity Center](#iam-identity-center) · [Organizations](#organizations) ·
[Organizational Unit (OU)](#organizational-unit-ou) ·
[Service Control Policy (SCP)](#service-control-policy-scp) · [Budgets](#budgets) ·
[Cost Anomaly Detection](#cost-anomaly-detection) ·
[CloudFormation and CDK](#cloudformation-and-cdk) ·
[Apps, stacks and constructs](#apps-stacks-and-constructs) ·
[Environments](#environments) · [CDK bootstrap](#cdk-bootstrap) ·
[Tags and cost allocation tags](#tags-and-cost-allocation-tags) ·
[CloudTrail](#cloudtrail) · [Config](#config) · [GuardDuty](#guardduty)

---

## Phase A — Ground the domain

### Foundations

#### Regions

**What:** AWS runs as separate regions, each a cluster of data centres, such as `eu-west-2`
(London). Most resources live in one region. A few services are **global**, among them IAM,
Organizations, CloudFront and Route 53.

**Here:** everything runs in `eu-west-2`. **`us-east-1` is the exception.** CloudFront only
accepts certificates issued there, so the certificate stack in step 7 lives there, and it
needs its own CDK bootstrap in step 5. Some billing APIs also answer only in `us-east-1`.

**Say it:** "Most of the stack is in London, but the CloudFront certificate has to be in
`us-east-1`, because CloudFront is a global service anchored there."

**See it:** `aws configure get region`

#### Account ID and ARNs

**What:** the 12-digit account ID identifies an AWS account. An **ARN** (Amazon Resource
Name) identifies any single thing in AWS, and the account ID sits inside it. For example,
`arn:aws:sts::<account>:assumed-role/<role>/<session>`.

**Here:** the account ID is not a secret, because knowing it grants nothing. It is still
kept out of this public repo, and the CDK app reads it from your login at deploy time.

**Say it:** "An account ID identifies; it doesn't authorise. Access always needs
credentials."

**See it:** `aws sts get-caller-identity`. The `Arn` it prints shows you as an assumed role
rather than a user.

### Identity: who you are when you call AWS

#### Root user

**What:** the identity created with the account, which signs in with the account's email
address. It can do everything, including a few things nothing else can, such as closing the
account. It can't be restricted by IAM.

**Here:** used only for setup checks, and protected by MFA. Day-to-day access goes through
Identity Center instead. The SCPs in step 3 will deny the root user in the workload account
outright.

**Say it:** "Root has MFA and isn't used day to day; member accounts have their root user
blocked by an SCP."

**See it:** `aws iam get-account-summary --query 'SummaryMap.AccountMFAEnabled'`. `1` means
root MFA is on.

#### IAM users

**What:** long-lived identities inside one account, each with a password and, optionally,
access keys. They sign in on the three-field page: account ID, username, password.

**Here:** **there are none, deliberately.** Long-lived access keys are the classic way
credentials leak. That's also why `jslog` fails on the three-field page: `jslog` is not an
IAM user.

**Say it:** "No IAM users and no access keys. Humans come in through Identity Center, and CI
will come in through OIDC federation."

**See it:** `aws iam list-users`, which returns an empty list.

#### IAM Identity Center

**What:** single sign-on for AWS, formerly called "AWS SSO". It holds users centrally,
separate from any one account. A **permission set** such as `AdministratorAccess` is turned
into an **IAM role** in each account it's assigned to. Signing in gives you temporary
credentials for that role.

**Here:** an **organization instance** in `eu-west-2`. You sign in at the access portal, and
`aws sso login --use-device-code` gets the CLI's short-lived credentials. When the workload
account is created in step 3, the same user is assigned to it. There is still one login,
now covering two accounts.

**Say it:** "People never have credentials in an account. They sign in once and assume a
role, and the credentials expire in hours."

**See it:**
`aws iam list-roles --query "Roles[?starts_with(RoleName,'AWSReservedSSO')].RoleName"`
lists the role your permission set became.

### Accounts and guardrails

#### Organizations

**What:** groups AWS accounts under one **management account**, which pays everyone's bill
(consolidated billing) and sets the rules for the member accounts. An account is AWS's
strongest isolation boundary: resources in different accounts can't touch each other
unless they are deliberately allowed to.

**Here:** the organisation already exists, and your original account is its management
account. Step 3 adds a `harpguru` workload account. The management account keeps only
billing, identity and audit, and runs no workloads.

**Say it:** "Workloads go in member accounts. That limits how much damage one mistake can do,
and it's the only way SCPs can apply to them."

**See it:** `aws organizations list-accounts --query 'Accounts[].[Name,Status]'`

#### Organizational Unit (OU)

**What:** a folder for accounts inside an organisation. OUs can be nested, and policies
attached to an OU apply to every account in it.

**Here:** step 3 creates a `Workloads` OU holding the `harpguru` account. The rules live on
the OU, so a future lab or staging account inherits them just by being placed there.

**Say it:** "Policies attach to OUs, not to individual accounts, so a new account is
governed from the moment it's filed."

**See it:**
`aws organizations list-organizational-units-for-parent --parent-id $(aws organizations list-roots --query 'Roots[0].Id' --output text)`

#### Service Control Policy (SCP)

**What:** a limit on what any identity in an account or OU can do. **It grants nothing; it
only limits.** Even `AdministratorAccess` can't exceed it. SCPs never apply to the
management account.

**Here:** step 3 first enables SCPs on the root, where they aren't yet switched on. It then
attaches policies to `Workloads` that:
- deny actions outside `eu-west-2` and `us-east-1`
- deny the root user
- deny leaving the organisation
- deny disabling CloudTrail or Config

**Say it:** "An action is only allowed if IAM allows it and no SCP denies it. An explicit deny
anywhere wins."

**See it:** `aws organizations list-roots --query 'Roots[0].PolicyTypes'` is empty until step
3. After step 3, run `aws organizations list-policies --filter SERVICE_CONTROL_POLICY`.

### Cost

#### Budgets

**What:** a spending threshold with email alerts on actual or forecast spend. **A budget does
not stop spending.** It only tells you. Billing data refreshes a few times a day, so alerts
lag behind the spending itself.

**Here:** a console-made `My Zero-Spend Budget` already exists. Step 2 adds a $10 budget as
code, alerting at 50, 80 and 100% of actual spend and at 100% of forecast. The zero-spend
budget is then deleted, because the hosted zone's $0.50 a month would set it off every month.
The rule is: **budget before the first deploy.**

**Say it:** "Budgets alert rather than cap, so the alarm goes in before anything that can
spend."

**See it:**
`aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text) --query 'Budgets[].[BudgetName,BudgetLimit.Amount]'`

#### Cost Anomaly Detection

**What:** a free service that learns your normal spending pattern and emails you when spend
jumps outside it, even if you're still below any budget.

**Here:** its default monitor is already running, with a daily email, so nothing is built
for it.

**Say it:** "Budgets catch totals; anomaly detection catches a sudden jump in rate, like a
runaway resource on day two."

**See it:** `aws ce get-anomaly-monitors --region us-east-1 --query 'AnomalyMonitors[].MonitorName'`

### Infrastructure as code

#### CloudFormation and CDK

**What:** **CloudFormation** creates and updates AWS resources from a template. It groups
them into **stacks** and keeps track of what each stack contains on AWS's side, rolling back
if an update fails. **CDK** lets you write that template in TypeScript. `cdk synth` produces
the CloudFormation template, `cdk diff` shows what would change, and `cdk deploy` applies it.

**Here:** all infrastructure is CDK, starting in step 1. Terraform is kept for deliberate,
throwaway labs only. CloudFormation keeps its record on AWS rather than in the container, so
destroying the container can never lose track of what's deployed. You run `cdk diff` and
`cdk deploy` yourself, and reading the diff is part of the learning.

**Say it:** "CDK compiles to CloudFormation, so the record of what's deployed lives in AWS
rather than on my laptop, and CloudFormation is what the exam tests."

**See it:** `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[].StackName'`

#### Apps, stacks and constructs

**What:** CDK's three levels.
- A **construct** is any building block, from one S3 bucket to a whole website made of
  many resources.
- A **stack** is a group of constructs deployed together as one CloudFormation stack, into
  one account and one region.
- The **app** is the root, holding every stack.

**Here:** the app is `infra/bin/harpguru.ts`. It has no stacks yet; each Phase A step adds
one. Stacks are split by **lifecycle and location**: the budget, the organisation and the
DNS zone change rarely, and the certificate has to live in `us-east-1`. That keeps any one
deploy small and its diff readable. *(PR `1-cdk-app`)*

**Say it:** "A stack is the unit of deployment, so I split them by what changes together and
where it has to live."

**See it:** `cd infra && cdk ls` lists the stacks. `cdk synth` writes each one's template to
`cdk.out/`, and it's worth opening one to see the CloudFormation that CDK actually produces.

#### Environments

**What:** in CDK, an environment is an **account plus a region**. A stack pinned to an
environment can use account-specific features, such as looking up an existing hosted zone.
A stack without one is "environment-agnostic": a single template that can be deployed
anywhere, but can't do those lookups.

**Here:** every stack is pinned. The region is written in the code, and the account comes
from `CDK_DEFAULT_ACCOUNT`, which the CLI fills in from your SSO login, so no account ID is
committed. Once step 3 creates the workload account, a second SSO profile for it supplies its
stacks' account the same way. *(PR `1-cdk-app`)*

**Say it:** "Stacks are pinned to an account and region, but the account comes from the
signed-in identity rather than from code."

**See it:** `cd infra && cdk ls --long` shows each stack's `aws://<account>/<region>`, once
stacks exist.

#### CDK bootstrap

**What:** a one-off setup per account and region, done with `cdk bootstrap`. It creates the
`CDKToolkit` stack, which holds an S3 bucket and an ECR repository for uploaded files and
container images, plus the IAM roles CDK assumes to deploy.

**Here:** the management account was bootstrapped in `eu-west-2` on 2026-08-28. In step 5,
the workload account is bootstrapped in **both** `eu-west-2` and `us-east-1`, because the
certificate stack lives in `us-east-1`.

**Say it:** "Bootstrap is per account and per region, so a stack in a second region needs a
second bootstrap."

**See it:**
`aws cloudformation describe-stack-resources --stack-name CDKToolkit --query 'StackResources[].ResourceType'`

#### Tags and cost allocation tags

**What:** tags are key–value labels on resources. **Cost allocation tags** are tags you
**activate** in the management account's billing settings, so that billing can split costs
by them. Activation isn't automatic, and a key can only be activated once a resource carries
it. Costs before activation aren't split unless you request a **backfill**, which reaches
back up to 12 months.

**Here:** every resource gets `project=harpguru`, `repository=harpguru-cloud` and
`managed-by=cdk`, applied once at the app root. Once tagged resources exist, `project` is
activated, so "what does Harp Guru cost?" becomes one filter in Cost Explorer. The tagging is
in PR `1-cdk-app`; the activation happens after step 6.

**Say it:** "Tag at the app root so nothing is missed, and activate the cost allocation tag
early; anything earlier needs a backfill."

**See it:** `aws ce list-cost-allocation-tags --region us-east-1 --query 'CostAllocationTags[].[TagKey,Status]'`.
For now it shows only CloudFormation's own automatic tags.

### Audit and detection

SCPs **prevent**. The three services below **record and detect**.

#### CloudTrail

**What:** a log of API calls: who called what, when, from where, and whether it worked.
Console clicks are API calls too. **Event history**, the last 90 days of management events
in each region, is always on and free. A **trail** is what you add to keep events longer, in
S3, across all regions and accounts.

**Here:** step 4 creates an **organisation trail**, one trail covering every account and
writing to S3. It's the record you'd check to find out who changed that DNS record. GuardDuty
also analyses the same events.

**Say it:** "Event history gives you 90 days for free; an org trail gives durable, central
retention that member accounts can't switch off."

**See it:** `aws cloudtrail lookup-events --max-results 5 --query 'Events[].[EventTime,EventName,Username]'`
works today, with no trail at all.

#### Config

**What:** a record of how each resource is **configured** over time, where CloudTrail records
**actions**. It can also check resources against rules, such as "no public S3 buckets".

**Here:** step 4 turns it on, limited to the two regions and using **periodic** (daily)
recording rather than continuous. Config charges for each change it records, so at full
settings it's the service most likely to creep past a few pounds.

**Say it:** "CloudTrail tells you who did it; Config tells you what the resource looked like
before and after."

**See it:** `aws configservice describe-configuration-recorders`, which is empty until step 4.

#### GuardDuty

**What:** threat detection you switch on and read. It analyses CloudTrail, DNS queries and
network flow data, reading them directly without you turning those logs on, and raises
**findings**. Examples include credentials used from an unusual place, calls to known
crypto-mining domains, and someone probing permissions.

**Here:** enabled in step 4. It's free for 30 days, then pennies at this volume.

**Say it:** "Prevention with SCPs, detection with GuardDuty; you want both, because
prevention is never complete."

**See it:** `aws guardduty list-detectors`, which is empty until step 4.
