import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { CfnAssignment, CfnPermissionSet } from 'aws-cdk-lib/aws-sso'
import type { Construct } from 'constructs'

export type IdentityStackProps = StackProps & {
  identityCenterInstanceArn: string
  adminPermissionSetArn: string
  adminPrincipalId: string
}

// The AdministratorAccess permission set, and its assignment to the
// management account. Both were made in the console before this app existed,
// and are adopted here with `cdk import`, not created: see Phase A, step 3b.
//
// An import adopts a resource without applying the template to it, so the
// template had to match the real thing, property for property; the project
// tags, which the console never set, were left off until after the import.
// Both are retained, so deleting this stack can never take away the login.
export class IdentityStack extends Stack {
  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props)

    const admin = new CfnPermissionSet(this, 'AdministratorAccess', {
      instanceArn: props.identityCenterInstanceArn,
      name: 'AdministratorAccess',
      managedPolicies: ['arn:aws:iam::aws:policy/AdministratorAccess'],
      sessionDuration: 'PT1H',
    })
    admin.applyRemovalPolicy(RemovalPolicy.RETAIN)

    // The workload account's assignment is in HarpguruAccounts, beside the
    // account it targets. Both name the permission set by the ARN in
    // deploy.local.json, as HarpguruAccounts already did, rather than by a
    // reference to the resource above, so that nothing in an import depends
    // on another resource's attributes.
    const management = new CfnAssignment(this, 'ManagementAdminAccess', {
      instanceArn: props.identityCenterInstanceArn,
      permissionSetArn: props.adminPermissionSetArn,
      principalType: 'USER',
      principalId: props.adminPrincipalId,
      targetType: 'AWS_ACCOUNT',
      targetId: this.account,
    })
    management.applyRemovalPolicy(RemovalPolicy.RETAIN)
  }
}
