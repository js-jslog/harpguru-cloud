# What CDK doesn't manage

Everything in the AWS accounts that no stack in `infra/` owns, and why. Read it beside
`infra/bin/harpguru.ts`, which lists what the stacks do own. Together they are the full
picture.

The test for what belongs in a stack, decided 2026-10-22: **anything someone made by hand is
brought into CDK where CloudFormation can manage it; anything AWS made by itself is listed
here and left as AWS made it.** The point is a record of manual work, and an AWS default is
not manual work. Bringing one into a stack, or deleting it, would only add work to record.

Three kinds of reason appear below:
- **Can't:** CloudFormation has no resource type for it, or it has to exist before any stack
  can.
- **Chose not:** a resource type exists, and leaving it outside is a recorded decision.
- **Not AWS:** it lives somewhere else entirely.

"No resource type" was checked on 2026-10-22 with
`aws cloudformation describe-type --type RESOURCE --type-name <type>`, which answers
`TypeNotFoundException` for a type that doesn't exist. A **custom resource** could still make
the API call for most of the "can't" items, as `HarpguruPolicyTypes` does for SCPs; each item
says why that isn't worth it.

Keep this list current: anything made outside a stack is added here in the PR that makes it.

## Management account

| Thing | Kind | Why it stays outside | See it |
| --- | --- | --- | --- |
| The account itself, and its root user's MFA | Can't | The account existed before any stack could run in it. Root MFA is set by signing in as root; no API sets it | `aws iam get-account-summary --query 'SummaryMap.AccountMFAEnabled'` (`1` is on) |
| The Organization | Chose not | `AWS::Organizations::Organization` exists. But the Organization predates the app, nothing about it changes, and a stack owning it would carry a delete risk, like the one designed out of `HarpguruPolicyTypes`. Decided 2026-10-22 | `aws organizations describe-organization --query 'Organization.FeatureSet'` |
| The IAM Identity Center instance | Chose not | `AWS::SSO::Instance` exists, though whether it can adopt an organization instance was not checked. Same reasons as the Organization. Decided 2026-10-22 | `aws sso-admin list-instances --query 'Instances[].Status'` |
| The Identity Center user `jslog` | Can't | There is no `AWS::IdentityStore::User`. A custom resource could create one, but a person's identity, with a password and MFA they set themselves, is not something to recreate from code | `aws identitystore list-users --identity-store-id <id> --query 'Users[].UserName'`, with the ID from `aws sso-admin list-instances` |
| Trusted access for `sso.amazonaws.com` | Can't | Switched on by Identity Center when it was enabled. There is no resource type for trusted access | `aws organizations list-aws-service-access-for-organization` |
| Cost Anomaly Detection's default monitor and its daily email | Chose not | `AWS::CE::AnomalyMonitor` and `AWS::CE::AnomalySubscription` exist. The console made them before this project, and the plan decided on 2026-09-26 not to rebuild them | `aws ce get-anomaly-monitors --region us-east-1 --query 'AnomalyMonitors[].MonitorName'` |
| The `project` cost allocation tag's activation | Can't | There is no resource type. It was activated once with the CLI on 2026-10-22, and stays active | `aws ce list-cost-allocation-tags --region us-east-1 --tag-keys project` |
| A default VPC in each of 17 regions | Chose not | As for the workload account's: made by AWS, unused, and left as they are. Decided 2026-10-22 | `aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[].CidrBlock'`, per region |
| The `CDKToolkit` bootstrap stack in `eu-west-2` | Can't | It is CloudFormation, but `cdk deploy` needs it before it can deploy anything, so the app can't own it. Made by `cdk bootstrap` on 2026-08-28 | `aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus'` |

## Workload account `harpguru`

| Thing | Kind | Why it stays outside | See it |
| --- | --- | --- | --- |
| `OrganizationAccountAccessRole` | Chose not | Organizations made it with the account, and it is the way back in if Identity Center breaks. `AWS::IAM::Role` exists, so it could be imported, but it is an AWS default, and in a stack it would be one template edit from being broken. Decided 2026-10-22 | `aws iam get-role --role-name OrganizationAccountAccessRole --profile harpguru --query 'Role.RoleName'` |
| The `AWSReservedSSO_AdministratorAccess_*` role | Can't | Identity Center creates and owns it when the permission set is assigned, and it can only be changed through the permission set. The assignment is in `HarpguruAccounts`; the role is its result | `aws iam list-roles --profile harpguru --query "Roles[?starts_with(RoleName,'AWSReservedSSO')].RoleName"` |
| The default VPCs in `eu-west-2` and `us-east-1` | Chose not | AWS made them with the account, and nothing uses them. `AWS::EC2::VPC` exists, but each is a VPC with subnets, an internet gateway and more, so importing means code for networks nobody uses. Deleting them, a common hardening step, was considered and dropped: it would be manual work to record, for little gain while the SCPs bound what can run. Decided 2026-10-22. See "Default VPC" in `docs/aws-concepts.md` | `aws ec2 describe-vpcs --profile harpguru --filters Name=is-default,Values=true --query 'Vpcs[].CidrBlock'` |
| The default VPCs in the other 15 regions | Can't | The region lock denies every action outside the two allowed regions, CloudFormation's included. Nothing in the account can import, use or delete them while it stands | `aws ec2 describe-vpcs --profile harpguru --region eu-central-1` is refused by the SCP |
| The root user | Can't | Created with the account, with no password. The `harpguru-deny-root` SCP blocks it, and centralised root access, which would remove its credentials, is deferred | See "Root user" in `docs/aws-concepts.md` |
| The `CDKToolkit` stacks in `eu-west-2` and `us-east-1` | Can't | As for the management account's. Made by `cdk bootstrap` on 2026-10-22, step 5 | `aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 --profile harpguru --query 'Stacks[0].StackStatus'` |

## Not AWS

| Thing | Where | Why |
| --- | --- | --- |
| The harpguru.com registration | Heart Internet | Decided before Phase A: delegate the domain to Route 53 rather than transfer it. The nameserver switch in step 6 is made in Heart's panel |
| `contact@harpguru.com` forwarding | Heart's mail hosting | Mail stays with Heart. Step 6's hosted zone carries its `MX` record so it keeps working |
| CLI profiles | `~/.aws/config` | Local to the container. `[default]` reaches the management account and `[profile harpguru]` the workload account, through one SSO session |
| Deploy-time values | `infra/deploy.local.json` | Gitignored, because the repo is public. See `infra/README.md` "Deploy-time values" |

## Moved into CDK

- 2026-10-22: the `AdministratorAccess` permission set and its management account assignment,
  imported into `HarpguruIdentity` (step 3b). Until the import is done, they are still
  console-only.

## Changes made outside CDK

Each one-off change made by hand or by script, newest last, so that work no template shows is
still on record. Add to it in the PR that makes the change. To see the current state, use the
"See it" command in the item's row above.

| Date | Account | Change | How |
| --- | --- | --- | --- |
| by 2026-10-13 | management | `My Zero-Spend Budget`, made in the console, deleted once the $10 budget was live (step 2) | the console |
| 2026-10-22 | management | `project` activated as a cost allocation tag | `aws ce update-cost-allocation-tags-status --region us-east-1 --cost-allocation-tags-status TagKey=project,Status=Active` |
