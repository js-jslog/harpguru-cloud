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
[Default VPC](#default-vpc) · [Root user](#root-user) · [IAM users](#iam-users) ·
[IAM Identity Center](#iam-identity-center) · [Organizations](#organizations) ·
[Organizational Unit (OU)](#organizational-unit-ou) ·
[Service Control Policy (SCP)](#service-control-policy-scp) ·
[OrganizationAccountAccessRole](#organizationaccountaccessrole) · [Budgets](#budgets) ·
[Cost Anomaly Detection](#cost-anomaly-detection) ·
[CloudFormation and CDK](#cloudformation-and-cdk) ·
[Change sets, stack events and logical IDs](#change-sets-stack-events-and-logical-ids) ·
[Apps, stacks and constructs](#apps-stacks-and-constructs) ·
[L1 and L2 constructs](#l1-and-l2-constructs) · [Custom resources](#custom-resources) ·
[Deletion policy and termination protection](#deletion-policy-and-termination-protection) ·
[Resource import and drift](#resource-import-and-drift) ·
[Cross-stack references](#cross-stack-references) ·
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

#### Default VPC

**What:** a VPC (Virtual Private Cloud) is a private network inside one region. AWS creates a
**default VPC** in every region of every new account, with a public subnet in each
availability zone and an internet gateway, so that an EC2 instance launched without any
networking choices can still reach the internet. It costs nothing while nothing runs in it.

**Here:** nothing uses one. Each account has one in every region, 17 each. They are left as
AWS made them, neither imported nor deleted, because they are AWS defaults rather than manual
work; the reasoning is in `docs/outside-cdk.md`. In the workload account, 15 of them can't be
touched at all: the region lock denies every action outside the two allowed regions, deletion
included. Phase F's VPC is to be designed from scratch, without NAT gateways.
*(PR `1-identity-import`)*

**Say it:** "Every account starts with a default VPC in every region. It's free, but it's a
public network nobody designed, so a hardened account either deletes it or makes sure
nothing lands in it."

**See it:**
`aws ec2 describe-vpcs --profile harpguru --filters Name=is-default,Values=true --query 'Vpcs[].CidrBlock'`
shows `172.31.0.0/16`, the range every default VPC uses. Add `--region us-east-1` for the other.

### Identity: who you are when you call AWS

#### Root user

**What:** the identity created with the account, which signs in with the account's email
address. It can do everything, including a few things nothing else can, such as closing the
account. It can't be restricted by IAM.

**Here:** used only for setup checks, and protected by MFA. Day-to-day access goes through
Identity Center instead. An account created through Organizations, like `harpguru`, starts
with a root user that has no password, although one can be set through "forgot password"
on its email address. So the `harpguru-deny-root` SCP denies the root user every action in
the workload account, live since step 3's deploy on 2026-10-22. AWS's newer **centralised root access** goes
further. It takes three settings in the management account: trusted access for IAM in
Organizations, then **root credentials management**, which lets the management account
delete member accounts' root credentials, and **privileged root actions**, which lets it do
the few tasks that need root without anyone signing in as root. With it on, new member accounts
are created with no root credentials and can't recover them. It is deferred to a step of its
own, a decision in the Phase A plan; switched on after `harpguru` exists, it can
still delete that account's credentials. *(PR `1-org-accounts`)*

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
`aws sso login --use-device-code` gets the CLI's short-lived credentials. The
`AdministratorAccess` permission set and its assignment to the management account were made
in the console. Its assignment to the workload account is code: an
`AWS::SSO::Assignment` in `HarpguruAccounts`, which also creates the
`AWSReservedSSO_AdministratorAccess_*` role in the new account. Since step 3's deploy on
2026-10-22, one login covers two accounts: the CLI reaches the new one through a second
profile, `harpguru`, which reuses the same SSO session. *(PR `1-org-accounts`)*

**Say it:** "People never have credentials in an account. They sign in once and assume a
role, and the credentials expire in hours."

**See it:**
`aws iam list-roles --query "Roles[?starts_with(RoleName,'AWSReservedSSO')].RoleName"`
lists the role your permission set became; add `--profile harpguru` to see it in the workload
account. `aws sts get-caller-identity --profile harpguru` shows you signed in there as that role.

**How long things last.** There are two lifetimes. The role credentials last as long as the
permission set's session duration, which for `AdministratorAccess` is one hour; the CLI
renews them silently while you are signed in. Being signed in is the second lifetime: the
token `aws sso login` caches, which lasts for Identity Center's session duration (AWS's
default is 8 hours; this instance's setting hasn't been checked). When it runs out, every
command fails with "Token has expired and refresh failed", and the fix is to sign in again.
`jq -r 'select(.startUrl) | .expiresAt' ~/.aws/sso/cache/*.json` shows when the token
expires, and works even when signed out. Print only that field: the same files hold the token
itself.
`aws sso-admin describe-permission-set --instance-arn <arn> --permission-set-arn <arn> --query PermissionSet.SessionDuration`
shows the role lifetime, as an ISO 8601 duration such as `PT1H`.

### Accounts and guardrails

#### Organizations

**What:** groups AWS accounts under one **management account**, which pays everyone's bill
(consolidated billing) and sets the rules for the member accounts. An account is AWS's
strongest isolation boundary: resources in different accounts can't touch each other
unless they are deliberately allowed to.

**Here:** the organisation already exists, and your original account is its management
account. Step 3 added a `harpguru` workload account in the `HarpguruAccounts` stack, deployed
on 2026-10-22, when creating it took under a minute. The
management account keeps only billing, identity and audit, and runs no workloads.
**Creating an account is the hard-to-undo step:** closing one takes a 90-day post-closure
period, during which it still counts against the Organization's account quota (10 by default).
Its name and email can't be changed through CloudFormation afterwards: AWS's resource docs say
such an update fails, and so does its rollback. The same docs say only the root user can change
them, which is out of date. They can still be changed outside the stack:
the management account can rename a member account and start an email change with the
Account Management API (`aws account put-account-name` and `start-primary-email-update`),
once that API's trusted access is switched on. The stack's template then no longer matches the
account, so the plan is to get both right first time. *(PR `1-org-accounts`)*

**Say it:** "Workloads go in member accounts. That limits how much damage one mistake can do,
and it's the only way SCPs can apply to them."

**See it:** `aws organizations list-accounts --query 'Accounts[].[Name,Status]'`

#### Organizational Unit (OU)

**What:** a folder for accounts inside an organisation. OUs can be nested, and policies
attached to an OU apply to every account in it.

**Here:** step 3 created a `Workloads` OU, which holds the `harpguru` account. The rules live on
the OU, so a future lab or staging account inherits them just by being placed there. The OU
and its SCPs are deployed in `HarpguruGuardrails` **before** the account stack, so the
account was created inside a governed OU, with no gap. *(PR `1-org-accounts`)*

**Say it:** "Policies attach to OUs, not to individual accounts, so a new account is
governed from the moment it's filed."

**See it:**
`aws organizations list-organizational-units-for-parent --parent-id $(aws organizations list-roots --query 'Roots[0].Id' --output text)`

#### Service Control Policy (SCP)

**What:** a limit on what any identity in an account or OU can do. **It grants nothing; it
only limits.** Even `AdministratorAccess` can't exceed it. SCPs never apply to the
management account.

**Here:** SCPs aren't switched on until something calls `EnablePolicyType` on the root: no
CloudFormation resource does it, so `HarpguruPolicyTypes` does it through a custom resource.
Switching them on also attaches AWS's `FullAWSAccess` policy
everywhere, because every target needs at least one SCP; the deny policies then cut
holes in it. `HarpguruGuardrails` attaches three to `Workloads`, each a separate policy so
each is readable on its own (the limit is 10 per target, checked against AWS's quotas page on
2026-10-14; it was once 5):
- `harpguru-region-lock` denies actions outside `eu-west-2` and `us-east-1`, exempting the five
  global services in the IAM guide's example (CloudFront, IAM, Organizations, Route 53 and
  Support). The Organizations guide's version exempts far more. Most global services are
  served from `us-east-1`, which is allowed anyway, so the list is a safety margin.
  `us-east-1` is allowed at all mainly because CloudFront only accepts ACM certificates issued
  there (see [Regions](#regions)); without it, step 7 could not create the certificate
- `harpguru-deny-root` denies the root user
- `harpguru-deny-leave-org` denies leaving the organisation

Denying anyone from turning off CloudTrail or Config comes in step 4, alongside the services it
protects, a decision in the Phase A plan. How SCPs are switched on is in
[Custom resources](#custom-resources). *(PRs `1-org-accounts`, `1-scp-custom-resource`)*

**Say it:** "An action is only allowed if IAM allows it and no SCP denies it. An explicit deny
anywhere wins."

**See it:** `aws organizations list-roots --query 'Roots[0].PolicyTypes'` is empty until SCPs
are switched on, which they have been since 2026-10-22.
`aws organizations list-policies --filter SERVICE_CONTROL_POLICY --query 'Policies[].Name'`
lists the four SCPs, and
`aws organizations describe-policy --policy-id <id> --query Policy.Content --output text | jq`
shows one policy exactly as written in `lib/guardrails-stack.ts`.
To watch the region lock refuse a call from inside the workload account:
`aws sqs list-queues --region us-west-2 --profile harpguru` fails with "explicit deny in a
service control policy", and the same call in `eu-west-2` succeeds.

#### OrganizationAccountAccessRole

**What:** an IAM role that Organizations creates in every account it creates. It has
administrator rights in that account and **trusts the management account**, so principals
there can assume it. Assuming a role in another account is the general cross-account
pattern: the role's **trust policy** says who may assume it, and its permissions say what
they can do once they have.

**Here:** `harpguru` gets one automatically. It's the way back in if the Identity Center
assignment ever breaks, so it's left in place. Day-to-day access still goes through Identity
Center, and SCPs still limit this role like any other identity in the account.
*(PR `1-org-accounts`)*

**Say it:** "Cross-account access is a role with a trust policy, never a shared credential.
Organizations makes one in each new account as a break-glass route from the management
account."

**See it:** using the workload account's profile,
`aws iam get-role --role-name OrganizationAccountAccessRole --profile harpguru --query 'Role.AssumeRolePolicyDocument'`
shows the trust policy naming the management account.

### Cost

#### Budgets

**What:** a spending threshold with email alerts on actual or forecast spend. **A budget does
not stop spending.** It only tells you. Billing data refreshes a few times a day, so alerts
lag behind the spending itself.

**Here:** `harpguru-monthly` is a $10 budget as code in the `HarpguruBudget` stack, deployed
on 2026-10-13 as this project's first deploy, alerting at 50, 80
and 100% of actual spend and at 100% of forecast. It sits in the management account, which
pays every member account's bill, so it covers the whole Organization. It ignores credits and
refunds, so a promotional credit can't hide real usage. It replaced a console-made
`My Zero-Spend Budget`, which was deleted once it was live, because from step 6 the hosted
zone's $0.50 a month would set it off every month. The rule is:
**budget before the first deploy.** *(PR `1-budget`)*

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

#### Change sets, stack events and logical IDs

**What:** what happens inside a deploy.
- A **change set** is CloudFormation's list of proposed changes to a stack. It's worked out
  first and then run, and it disappears once it has been run.
- Each step of the deploy is recorded as a **stack event**. When a deploy fails, the earliest
  `FAILED` event gives the reason, and the `ROLLBACK` events after it are CloudFormation undoing
  the rest. The console lists events newest first, so there it is the lowest `FAILED` line.
- Each resource has a **logical ID**, its name in the template, and a **physical ID**, the
  real thing's name in AWS. CloudFormation tracks resources by logical ID.

**Here:** `cdk diff` builds a read-only change set; `cdk deploy` builds one and runs it. The
first deploy, `HarpguruBudget` on 2026-10-13, took 13 seconds from `REVIEW_IN_PROGRESS` to
`CREATE_COMPLETE`. The budget's logical ID is `Monthly`, taken from
`new CfnBudget(this, 'Monthly', …)`, and its physical ID is `harpguru-monthly`. Renaming
`'Monthly'` in the code would make the next deploy delete the budget and create a new one.
*(PR `1-budget`)*

A new stack exists from the moment its first change set is made, in `REVIEW_IN_PROGRESS`.
On 2026-10-22 the first `cdk deploy HarpguruPolicyTypes`, run with `!` and so without a
terminal to ask for approval of IAM changes, made its change set and then gave up. It left
an empty `REVIEW_IN_PROGRESS` stack with termination protection already on, so it couldn't
tidy that stack up. The fix was to switch protection off, delete the empty stack, and
deploy again with `--require-approval never` once the diff had been read. That flag skips
the approval prompt, which is the step that shows the IAM and other security changes before
anything runs, so the diff read beforehand becomes the only review.

**Say it:** "CloudFormation tracks resources by logical ID, so renaming a construct means
replacing the resource; I read the diff for replacements before every deploy."

**See it:** read the events oldest first, and match logical IDs to physical ones:
`aws cloudformation describe-stack-events --stack-name HarpguruBudget --query 'reverse(StackEvents)[].[Timestamp,LogicalResourceId,ResourceStatus]' --output table`
and
`aws cloudformation describe-stack-resources --stack-name HarpguruBudget --query 'StackResources[].[LogicalResourceId,PhysicalResourceId,ResourceType]' --output table`.
In the console, the same views are the **Events** and **Resources** tabs of the stack in
CloudFormation, in London.

#### Apps, stacks and constructs

**What:** CDK's three levels.
- A **construct** is any building block, from one S3 bucket to a whole website made of
  many resources.
- A **stack** is a group of constructs deployed together as one CloudFormation stack, into
  one account and one region.
- The **app** is the root, holding every stack.

**Here:** the app is `infra/bin/harpguru.ts`. Each Phase A step adds a stack, starting with
`HarpguruBudget` in step 2. Stacks are split by **lifecycle and location**: the budget, the organisation and the
DNS zone change rarely, and the certificate has to live in `us-east-1`. That keeps any one
deploy small and its diff readable. *(PR `1-cdk-app`)*

**Say it:** "A stack is the unit of deployment, so I split them by what changes together and
where it has to live."

**See it:** `cd infra && cdk ls` lists the stacks. `cdk synth` writes each one's template to
`cdk.out/`, and it's worth opening one to see the CloudFormation that CDK actually produces.

#### L1 and L2 constructs

**What:** CDK constructs come in levels.
- **L1** constructs are named `Cfn*`, such as `CfnBudget`. Each maps one-to-one onto a
  CloudFormation resource and is generated from its schema. You set every property yourself,
  in CloudFormation's own shape.
- **L2** constructs, such as `s3.Bucket`, are hand-written. They add sensible defaults, helper
  methods such as `bucket.grantRead(role)`, and support for tagging.
- **L3** constructs, or patterns, combine several resources into one, such as a whole
  static site.

**Here:** Budgets has no L2, so `HarpguruBudget` uses `CfnBudget`. One consequence: CDK's
`Tags.of()` skips it, so the app-root tags never reach it. The stack sets `resourceTags` by
hand, and a test checks that the tags are there. Step 8 is the first L2-heavy stack.
*(PR `1-budget`)*

**Say it:** "When a service has no L2, I drop to the `Cfn` construct. It's the raw
CloudFormation resource with types, and I lose the defaults and the tagging."

**See it:** `cd infra && cdk synth HarpguruBudget`. The properties in the template have the
same shape as the `CfnBudget` props in `lib/budget-stack.ts`, which is what makes it L1.

#### Custom resources

**What:** a way to make CloudFormation do something it has no resource type for. You supply
code, usually a Lambda function, that CloudFormation calls on create, update and delete. CDK's
`AwsCustomResource` builds one that makes a single AWS API call, with the Lambda and its IAM
role generated for you.

**Here:** `HarpguruPolicyTypes` holds one, which calls `EnablePolicyType` to switch SCPs on for
the root. The danger is the reverse call: `DisablePolicyType` would detach every SCP in the
Organization. So that can never happen, there are three layers. The resource has no delete
call, and no update call either. It is `Retain`, so CloudFormation never even asks it to
delete. And it sits alone in a termination-protected stack, so no change to the guardrails can
reach it. Termination protection adds little to the first two, but it keeps the Lambda in
place, and it makes a deliberate delete take two steps. Its Lambda's role may call
`organizations:EnablePolicyType` and nothing else. It ignores
`PolicyTypeAlreadyEnabledException`, so it does no harm if SCPs were already switched on by
hand. The alternative was a one-off CLI command, which avoids the Lambda
and role in the management account. Deployed on 2026-10-22, the stack holds five resources besides CDK's own metadata:
the custom resource, the Lambda, its role, the role's policy, and a log group for the Lambda.
The diff had not been expected to show the log group. This CDK version creates it explicitly, so
it carries the project's tags and keeps logs for two years, at no real cost for a function
that ran once. *(PRs `1-org-accounts`, `1-scp-custom-resource`)*

**Say it:** "When CloudFormation has no resource for something, a custom resource runs code
for it. If the reverse of that action is dangerous, I give it no delete handler and retain it."

**See it:**
`aws cloudformation describe-stack-resources --stack-name HarpguruPolicyTypes --query 'StackResources[].[LogicalResourceId,ResourceType]' --output table`
shows the custom resource beside its Lambda, role, policy and log group, and
`aws organizations list-roots --query 'Roots[0].PolicyTypes'` shows what it switched on.

#### Deletion policy and termination protection

**What:** two different safety catches.
- A resource's **`DeletionPolicy`** says what happens to the real thing when CloudFormation
  stops managing it. `Delete` removes it; `Retain` leaves it in place and only drops it from
  the stack. **`UpdateReplacePolicy`** does the same for the old copy when an update replaces
  a resource.
- **Termination protection** is a setting on a whole stack that refuses `delete-stack` until
  someone switches it off.

**Here:** the `harpguru` account is `Retain` for both, set with
`applyRemovalPolicy(RemovalPolicy.RETAIN)`, although `Retain` is already CloudFormation's
default for accounts. `HarpguruGuardrails` and `HarpguruAccounts` both have termination
protection, because deleting the first would strip the guardrails off the OU.
`HarpguruPolicyTypes` has it too, and its custom resource is `Retain`. `HarpguruBudget` has
neither. *(PRs `1-org-accounts`, `1-scp-custom-resource`)*

**Say it:** "Retain protects a resource from its stack; termination protection protects the
stack from a careless delete. Anything stateful or irreplaceable gets both."

**See it:**
`aws cloudformation describe-stacks --query 'Stacks[].[StackName,EnableTerminationProtection]' --output table`.
Since step 3's deploy on 2026-10-22, only its three stacks show `True`.

#### Resource import and drift

**What:** **resource import** adopts something that already exists into a stack, without
recreating it. You write the resource in the template as it really is, give CloudFormation its
identifiers, and it makes an `IMPORT` change set. **An import never changes the resource**,
and every imported resource must carry a deletion policy; both here are `Retain`. **Drift** is any difference between what a
template says and what is really there, and **drift detection** compares them on demand. A
diff can't help here: it compares templates, not reality, and it shows an import as an addition.

**Here:** `HarpguruIdentity` (step 3b) adopts the console-made `AdministratorAccess`
permission set and its management account assignment, with `cdk import` and a resource
mapping printed by `infra/scripts/identity-import-mapping.sh`. Because an import changes
nothing, the code leaves off the project tags the console never set. They go on afterwards in
an ordinary deploy, so the drift check in between can come back clean. A plain `cdk deploy`
of the new stack would instead try to create a second permission set with the same name.
*(PR `1-identity-import`)*

**Say it:** "Import adopts a resource as it is, and only then do I change it, in a normal
deploy; drift detection, not a diff, is what tells me the template matches reality."

**See it:** drift detection on a stack that already exists:
`aws cloudformation detect-stack-drift --stack-name HarpguruAccounts`, then, a few seconds later,
`aws cloudformation describe-stack-resource-drifts --stack-name HarpguruAccounts --query 'StackResourceDrifts[].[LogicalResourceId,StackResourceDriftStatus]'`.
On 2026-10-22 both resources were `IN_SYNC`.

#### Cross-stack references

**What:** how one stack uses a value another stack creates. In CDK you just pass the value,
such as `guardrails.workloadsOu.attrId`, and CDK writes the plumbing. Which plumbing depends on
the `@aws-cdk/core:defaultCrossStackReferences` setting in `infra/cdk.json` (set to `"weak"`
here), and on whether the two
stacks share a region:

| | Same region | Different regions |
| --- | --- | --- |
| **Strong**, the default if the setting is absent | an **Output with an Export**, read with `Fn::ImportValue` | custom resources that copy the value into an SSM parameter in the consumer's region |
| **Weak**, our setting since `1-cdk-app` | a plain **Output**, read with `Fn::GetStackOutput` | a plain **Output**, read with `Fn::GetStackOutput`, which names the producer's region |

A strong reference locks the producer: CloudFormation refuses to change or delete an export
while another stack imports it. A weak one locks nothing; the consumer reads the output when
it deploys and keeps that value until its next deploy. Weak is what `cdk init` writes for new
projects. Step 7's certificate, made in `us-east-1` and used by the site in `eu-west-2`, will be
the first reference between regions.

**Here:** `HarpguruAccounts` reads the `Workloads` OU's ID from `HarpguruGuardrails`'s output.
The reference also makes CDK deploy the guardrails first, which is the order we want. Being
weak, it doesn't guard the guardrails stack; termination protection does that. Until the
deploy on 2026-10-22 this entry described exports, which no stack here uses.
*(PR `1-org-accounts`; corrected in `1-deploy-org-accounts`)*

**Say it:** "A strong reference locks the producer while it's consumed; a weak one just reads
its output at deploy time, so stability has to come from somewhere else, like termination
protection."

**See it:** the reference as deployed:
`aws cloudformation get-template --stack-name HarpguruAccounts --query 'TemplateBody.Resources.Harpguru.Properties.ParentIds'`.
The output it reads, with no export name:
`aws cloudformation describe-stacks --stack-name HarpguruGuardrails --query 'Stacks[0].Outputs'`.

#### Environments

**What:** in CDK, an environment is an **account plus a region**. A stack pinned to an
environment can use account-specific features, such as looking up an existing hosted zone.
A stack without one is "environment-agnostic": a single template that can be deployed
anywhere, but can't do those lookups.

**Here:** every stack is pinned. The region is written in the code, and the account comes
from `CDK_DEFAULT_ACCOUNT`, which the CLI fills in from your SSO login, so no account ID is
committed. The workload account's stacks, from step 6, will get theirs the same way, from the
`harpguru` profile added after step 3's deploy. *(PR `1-cdk-app`)*

**Say it:** "Stacks are pinned to an account and region, but the account comes from the
signed-in identity rather than from code."

**See it:** `cd infra && cdk ls --long` shows each stack's `aws://<account>/<region>`.

#### CDK bootstrap

**What:** a one-off setup per account and region, done with `cdk bootstrap`. It creates the
`CDKToolkit` stack, which holds an S3 bucket and an ECR repository for uploaded files and
container images, plus the IAM roles CDK assumes to deploy.

**Here:** the management account was bootstrapped in `eu-west-2` on 2026-08-28. The workload
account was bootstrapped in **both** `eu-west-2` and `us-east-1` on 2026-10-22, in step 5,
because the certificate stack will live in `us-east-1`. Two defaults were kept. CloudFormation's
execution role, which actually creates resources, has `AdministratorAccess` in the account, so
anyone allowed to deploy is in effect an admin there, still inside the SCPs. And no other
account is trusted to deploy, because deploys run as me through the `harpguru` profile; a CI
pipeline would need `--trust`. Bootstrap doesn't take tags from the app, so the workload
account's bootstrap was given the project's three with `--tags`.

**Say it:** "Bootstrap is per account and per region, so a stack in a second region needs a
second bootstrap."

**See it:**
`aws cloudformation describe-stack-resources --stack-name CDKToolkit --region us-east-1 --profile harpguru --query 'StackResources[].ResourceType'`
lists the bucket, repository, roles and parameter in the workload account's second region.

#### Tags and cost allocation tags

**What:** tags are key–value labels on resources. **Cost allocation tags** are tags you
**activate** in the management account's billing settings, so that billing can split costs
by them. Activation isn't automatic, and a key can only be activated once a resource carries
it. Costs before activation aren't split unless you request a **backfill**, which reaches
back up to 12 months.

**Here:** every resource gets `project=harpguru`, `repository=harpguru-cloud` and
`managed-by=cdk`, applied once at the app root. The exceptions are L1 resources that CDK
can't tag, such as the budget, which set them by hand (see
[L1 and L2 constructs](#l1-and-l2-constructs)). `project` was activated on 2026-10-22, so "what does Harp Guru cost?" is one filter in Cost Explorer.
Activation only splits costs from that day on. The tagging is in PR `1-cdk-app`.

**Say it:** "Tag at the app root so nothing is missed, and activate the cost allocation tag
early; anything earlier needs a backfill."

**See it:** `aws ce list-cost-allocation-tags --region us-east-1 --query 'CostAllocationTags[].[TagKey,Status]'`.
It shows `project` as `Active`, and `repository` and `managed-by` as `Inactive`, beside
CloudFormation's own automatic tags. A key only appears there once a resource carries it.
Cost Explorer splits by it a day or so after activation.

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
