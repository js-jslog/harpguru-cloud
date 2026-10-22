import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnRole } from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'
import { withoutProjectTags } from './tags'

export type BreakGlassStackProps = StackProps & {
  managementAccountId: string
}

// OrganizationAccountAccessRole, in the workload account: the role
// Organizations made with the account, which the management account can
// assume to get back in if Identity Center ever breaks. Adopted here with
// `cdk import`, not created: see Phase A, step 3b.
//
// It is written exactly as Organizations made it, because an import changes
// nothing. Changing it later is a normal deploy, but a mistake in the trust
// policy would close the way back in, so read any diff to it closely.
export class BreakGlassStack extends Stack {
  constructor(scope: Construct, id: string, props: BreakGlassStackProps) {
    super(scope, id, props)

    const role = new CfnRole(this, 'OrganizationAccountAccessRole', {
      roleName: 'OrganizationAccountAccessRole',
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${props.managementAccountId}:root`,
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: ['arn:aws:iam::aws:policy/AdministratorAccess'],
    })
    role.applyRemovalPolicy(RemovalPolicy.RETAIN)

    // Organizations made it untagged.
    withoutProjectTags(role)
  }
}
