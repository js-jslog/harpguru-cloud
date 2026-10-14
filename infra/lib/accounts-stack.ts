import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnAccount } from 'aws-cdk-lib/aws-organizations'
import { CfnAssignment } from 'aws-cdk-lib/aws-sso'
import type { Construct } from 'constructs'

export type AccountsStackProps = StackProps & {
  parentOuId: string
  workloadAccountEmail: string
  identityCenterInstanceArn: string
  adminPermissionSetArn: string
  adminPrincipalId: string
}

// The harpguru workload account, and the Identity Center assignment that
// lets the existing login into it.
//
// Creating an account is the one hard-to-undo step in Phase A: closing it
// takes a 90-day post-closure period. Its name and email can't be changed
// through CloudFormation, and renaming the construct id below would make
// CloudFormation try to create a second account. Leave both alone.
export class AccountsStack extends Stack {
  constructor(scope: Construct, id: string, props: AccountsStackProps) {
    super(scope, id, props)

    const account = new CfnAccount(this, 'Harpguru', {
      accountName: 'harpguru',
      email: props.workloadAccountEmail,
      parentIds: [props.parentOuId],
    })
    // Already CloudFormation's default for accounts; said explicitly so that
    // deleting this stack visibly cannot close the account.
    account.applyRemovalPolicy(RemovalPolicy.RETAIN)

    // Creating the assignment also provisions the permission set into the
    // account, as an AWSReservedSSO_AdministratorAccess_* role.
    new CfnAssignment(this, 'AdminAccess', {
      instanceArn: props.identityCenterInstanceArn,
      permissionSetArn: props.adminPermissionSetArn,
      principalType: 'USER',
      principalId: props.adminPrincipalId,
      targetType: 'AWS_ACCOUNT',
      targetId: account.attrAccountId,
    })

    // Needed once, for the [profile harpguru] section in ~/.aws/config.
    // Shown by the deploy and in the console; never committed.
    new CfnOutput(this, 'WorkloadAccountId', { value: account.attrAccountId })
  }
}
