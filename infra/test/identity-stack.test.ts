import { Match, Template } from 'aws-cdk-lib/assertions'
import { IdentityStack } from '../lib/identity-stack'
import { applyProjectTags } from '../lib/tags'
import { appWithFlags } from './app'

const instanceArn = 'arn:aws:sso:::instance/ssoins-1234567890abcdef'
const permissionSetArn =
  'arn:aws:sso:::permissionSet/ssoins-1234567890abcdef/ps-1234567890abcdef'

const synth = () => {
  const app = appWithFlags()
  applyProjectTags(app)
  const stack = new IdentityStack(app, 'Identity', {
    env: { account: '111111111111', region: 'eu-west-2' },
    identityCenterInstanceArn: instanceArn,
    adminPermissionSetArn: permissionSetArn,
    adminPrincipalId: '12345678-1234-1234-1234-123456789012',
  })
  return Template.fromStack(stack)
}

// An import adopts what exists and changes nothing, so these are the
// console-made permission set's settings exactly, as read on 2026-10-22.
test('the permission set matches the one made in the console', () => {
  synth().templateMatches({
    Resources: {
      AdministratorAccess: {
        Type: 'AWS::SSO::PermissionSet',
        Properties: {
          InstanceArn: instanceArn,
          Name: 'AdministratorAccess',
          ManagedPolicies: ['arn:aws:iam::aws:policy/AdministratorAccess'],
          SessionDuration: 'PT1H',
          Tags: Match.absent(),
          Description: Match.absent(),
          InlinePolicy: Match.absent(),
          RelayStateType: Match.absent(),
          PermissionsBoundary: Match.absent(),
          CustomerManagedPolicyReferences: Match.absent(),
        },
      },
    },
  })
})

test('the management account assignment gives the user the permission set', () => {
  synth().hasResourceProperties('AWS::SSO::Assignment', {
    InstanceArn: instanceArn,
    PermissionSetArn: permissionSetArn,
    PrincipalType: 'USER',
    TargetType: 'AWS_ACCOUNT',
    TargetId: '111111111111',
  })
})

// Logical IDs are what the import mapping names, and renaming either would
// make a later deploy try to create a second one.
test('both resources keep the logical IDs they are imported under, and are retained', () => {
  const template = synth()
  for (const [id, type] of [
    ['AdministratorAccess', 'AWS::SSO::PermissionSet'],
    ['ManagementAdminAccess', 'AWS::SSO::Assignment'],
  ]) {
    expect(template.toJSON().Resources[id]).toMatchObject({
      Type: type,
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    })
  }
})
