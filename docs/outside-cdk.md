# What CDK doesn't manage

Everything in the AWS accounts that no stack in `infra/` owns, and why. Read it beside
`infra/bin/harpguru.ts`, which lists what the stacks do own. Together they are the full
picture.

The test, decided 2026-10-22: **every piece of manual work is on record, and AWS defaults are
left alone.**
- **Made by hand, and configuration that may change:** brought into a stack where
  CloudFormation can manage it, so each change shows in a diff. The permission set and its
  management account assignment.
- **Made by hand, as a one-off foundation that predates the app:** recorded here, not
  imported, where a stack would add a delete risk and nothing about it changes. The
  Organization, the Identity Center instance, the anomaly monitor and Resource Explorer.
- **Made by AWS itself:** listed here and left as AWS made it. An AWS default is not manual
  work, and importing or deleting one would only add work to record.

Three kinds of reason appear below:
- **Can't:** CloudFormation has no resource type for it, it has to exist before any stack can,
  or something else forbids touching it: the service that owns it, or one of this project's
  SCPs.
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
| The `AWSReservedSSO_AdministratorAccess_*` role | Can't | Identity Center creates and owns it, from the assignment now in `HarpguruIdentity`, and it can only be changed through the permission set | `aws iam list-roles --query "Roles[?starts_with(RoleName,'AWSReservedSSO')].RoleName"` |
| Service-linked roles: `AWSServiceRoleForOrganizations`, `ForSSO`, `ForSupport`, `ForTrustedAdvisor` and `ForResourceExplorer` | Can't | Each AWS service creates its own, under `/aws-service-role/`, and only that service may change it. `AWS::IAM::ServiceLinkedRole` can create one, but these already belong to their services | `aws iam list-roles --path-prefix /aws-service-role/ --query 'Roles[].RoleName'` |
| Resource Explorer: a local index in `eu-west-2` and one view | Chose not | Switched on by hand in the console on 2026-08-28, before this project's app, and found only on 2026-10-22. `AWS::ResourceExplorer2::Index` and `View` exist, but it is a one-off console convenience, not configuration the project depends on, so it is recorded here and kept. It is free. Decided 2026-10-22 | `aws resource-explorer-2 list-indexes --region eu-west-2` |
| Trusted access for `sso.amazonaws.com` | Can't | Switched on by Identity Center when it was enabled. There is no resource type for trusted access | `aws organizations list-aws-service-access-for-organization` |
| Trusted access for `cloudtrail.amazonaws.com`, and `AWSServiceRoleForCloudTrail` | Can't | Must be on before `HarpguruTrail` can make an org trail, and there is no resource type for trusted access. Switched on with one CLI command in step 4a; see "Changes made outside CDK" below. The role is CloudTrail's own: it appeared when the stack made the trail, not when trusted access went on (seen 2026-10-30) | `aws organizations list-aws-service-access-for-organization`, and `aws iam get-role --role-name AWSServiceRoleForCloudTrail --query Role.CreateDate` |
| Cost Anomaly Detection's default monitor and its daily email | Chose not | `AWS::CE::AnomalyMonitor` and `AWS::CE::AnomalySubscription` exist. The console made them before this project, and the plan's step 2 decided not to rebuild them | `aws ce get-anomaly-monitors --region us-east-1 --query 'AnomalyMonitors[].MonitorName'` |
| The `project` cost allocation tag's activation | Can't | There is no resource type. It was activated once with the CLI on 2026-10-22, and stays active | `aws ce list-cost-allocation-tags --region us-east-1 --tag-keys project` |
| A default VPC in each of 17 regions | Chose not | As for the workload account's: made by AWS, unused, and left as they are. Decided 2026-10-22 | `aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[].CidrBlock'`, per region |
| The `CDKToolkit` bootstrap stack in `eu-west-2` | Can't | It is CloudFormation, but `cdk deploy` needs it before it can deploy anything, so the app can't own it. Made by `cdk bootstrap` on 2026-08-28 | `aws cloudformation describe-stacks --stack-name CDKToolkit --query 'Stacks[0].StackStatus'` |

## Workload account `harpguru`

| Thing | Kind | Why it stays outside | See it |
| --- | --- | --- | --- |
| `OrganizationAccountAccessRole` | Chose not | Organizations made it with the account, and it is the way back in if Identity Center breaks. `AWS::IAM::Role` exists, so it could be imported, but it is an AWS default, and in a stack it would be one template edit from being broken. Decided 2026-10-22 | `aws iam get-role --role-name OrganizationAccountAccessRole --profile harpguru --query 'Role.RoleName'` |
| The `AWSReservedSSO_AdministratorAccess_*` role | Can't | Identity Center creates and owns it when the permission set is assigned, and it can only be changed through the permission set. The assignment is in `HarpguruAccounts`; the role is its result | `aws iam list-roles --profile harpguru --query "Roles[?starts_with(RoleName,'AWSReservedSSO')].RoleName"` |
| Service-linked roles: `AWSServiceRoleForOrganizations`, `ForSSO`, `ForSupport`, `ForTrustedAdvisor` and `ForCloudTrail` | Can't | As in the management account: each belongs to the service that made it. CloudTrail's arrived with the org trail, by 2026-10-30. Config's, `AWSServiceRoleForConfig`, is the exception: `HarpguruConfig` creates it | `aws iam list-roles --profile harpguru --path-prefix /aws-service-role/ --query 'Roles[].RoleName'` |
| The default VPCs in `eu-west-2` and `us-east-1` | Chose not | AWS made them with the account, and nothing uses them. `AWS::EC2::VPC` exists, but each is a VPC with subnets, an internet gateway and more, so importing means code for networks nobody uses. Deleting them, a common hardening step, was considered and dropped: it would be manual work to record, for little gain while the SCPs bound what can run. Decided 2026-10-22. See "Default VPC" in `docs/aws-concepts.md` | `aws ec2 describe-vpcs --profile harpguru --filters Name=is-default,Values=true --query 'Vpcs[].CidrBlock'` |
| The default VPCs in the other 15 regions | Can't | `AWS::EC2::VPC` exists, but the region lock, this project's own SCP, denies every action outside the two allowed regions, CloudFormation's included. Nothing in the account can import, use or delete them while it stands. Were the lock lifted, they would be "chose not", like the rest | `aws ec2 describe-vpcs --profile harpguru --region eu-central-1` is refused by the SCP |
| The root user | Can't | Created with the account, with no password. The `harpguru-deny-root` SCP blocks it, and centralised root access, which would remove its credentials, is deferred | See "Root user" in `docs/aws-concepts.md` |
| The hosted zone's `NS` and `SOA` records | Can't | Route 53 writes them when it makes the zone, and they go when it does. They show in the zone, not in the template | `aws route53 list-resource-record-sets --profile harpguru --hosted-zone-id <Id> --query "ResourceRecordSets[?Type=='NS'\|\|Type=='SOA'].Type"`, with the `Id` from `aws route53 list-hosted-zones-by-name --dns-name harpguru.com --profile harpguru` |
| Verification of the mail canary's forwarding address | Can't | SES mails a link to the address when `HarpguruMailCanary` creates its identity, and only a click on it verifies the address. The identity itself is in the stack | `aws sesv2 get-email-identity --email-identity <address> --profile harpguru --query VerifiedForSendingStatus` |
| The `CDKToolkit` stacks in `eu-west-2` and `us-east-1` | Can't | As for the management account's. Made by `cdk bootstrap` on 2026-10-22, step 5 | `aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 --profile harpguru --query 'Stacks[0].StackStatus'` |

## Not AWS

| Thing | Where | Why |
| --- | --- | --- |
| The harpguru.com registration | Heart Internet | Decided before Phase A: delegate the domain to Route 53 rather than transfer it. The nameserver switch in step 6 was made in Heart's panel on 2026-10-27. What Heart serves that the new zone leaves behind, deliberately, is listed in `docs/plans/phase-a.md` "Steps" (item 6) |
| `contact@harpguru.com` forwarding | Heart's mail hosting | Mail stays with Heart. Step 6's hosted zone carries its `MX` record so it keeps working |
| CLI profiles | `~/.aws/config` | Local to the container. `[default]` reaches the management account and `[profile harpguru]` the workload account, through one SSO session |
| Deploy-time values | `infra/deploy.local.json` | Gitignored, because the repo is public. See `infra/README.md` "Deploy-time values" |

## Moved into CDK

- 2026-10-22: the `AdministratorAccess` permission set and its management account assignment,
  imported into `HarpguruIdentity` (step 3b).

## Changes made outside CDK

Each one-off change made by hand or by script, newest last, so that work no template shows is
still on record. Add to it in the PR that makes the change. To see the current state, use the
"See it" command in the item's row above.

| Date | Account | Change | How |
| --- | --- | --- | --- |
| by 2026-10-13 | management | `My Zero-Spend Budget`, made in the console, deleted once the $10 budget was live (step 2) | the console |
| 2026-10-22 | management | the empty `HarpguruPolicyTypes` stack left by a failed first deploy: termination protection switched off, then the stack deleted, before the real deploy (step 3). See "Change sets, stack events and logical IDs" in `docs/aws-concepts.md` | `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name HarpguruPolicyTypes`, then `aws cloudformation delete-stack --stack-name HarpguruPolicyTypes` |
| 2026-10-22 | management | `project` activated as a cost allocation tag | `aws ce update-cost-allocation-tags-status --region us-east-1 --cost-allocation-tags-status TagKey=project,Status=Active` |
| 2026-10-30 | management | trusted access for `cloudtrail.amazonaws.com` switched on, before `HarpguruTrail`'s deploy (step 4a) | `aws organizations enable-aws-service-access --service-principal cloudtrail.amazonaws.com` |
| 2026-10-30 | workload | the empty `HarpguruConfig` stack and its empty, retained bucket, left by the first deploy's rollback: termination protection switched off, the stack deleted, then the bucket, before the retry (step 4b) | `aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name HarpguruConfig`, `aws cloudformation delete-stack --stack-name HarpguruConfig`, then `aws s3 rb s3://harpguru-config-<account id>`, each with `--profile harpguru` |
