import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { CfnOrganizationalUnit } from 'aws-cdk-lib/aws-organizations'
import { AccountsStack } from '../lib/accounts-stack'
import { appWithFlags } from './app'

const props = {
  parentOuId: 'ou-abcd-12345678',
  workloadAccountEmail: 'a+harpguru@b.co',
  identityCenterInstanceArn: 'arn:aws:sso:::instance/ssoins-1234567890abcdef',
  adminPermissionSetArn:
    'arn:aws:sso:::permissionSet/ssoins-1234567890abcdef/ps-1234567890abcdef',
  adminPrincipalId: '12345678-1234-1234-1234-123456789012',
}

const synth = () =>
  Template.fromStack(new AccountsStack(appWithFlags(), 'Accounts', props))

test('the harpguru account is created inside the given OU', () => {
  synth().hasResourceProperties('AWS::Organizations::Account', {
    AccountName: 'harpguru',
    Email: 'a+harpguru@b.co',
    ParentIds: ['ou-abcd-12345678'],
  })
})

test('the account is retained if its stack is deleted or it is replaced', () => {
  synth().hasResource('AWS::Organizations::Account', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  })
})

test('the account keeps the logical ID it was created under', () => {
  // Renaming it would make CloudFormation create a second account.
  expect(
    Object.keys(synth().findResources('AWS::Organizations::Account'))
  ).toEqual(['Harpguru'])
})

test('the user is given AdministratorAccess in the new account', () => {
  synth().hasResourceProperties('AWS::SSO::Assignment', {
    InstanceArn: props.identityCenterInstanceArn,
    PermissionSetArn: props.adminPermissionSetArn,
    PrincipalType: 'USER',
    PrincipalId: props.adminPrincipalId,
    TargetType: 'AWS_ACCOUNT',
    TargetId: { 'Fn::GetAtt': ['Harpguru', 'AccountId'] },
  })
})

test('the OU reaches the account as a weak cross-stack reference', () => {
  const app = appWithFlags()
  const producer = new Stack(app, 'Producer')
  const ou = new CfnOrganizationalUnit(producer, 'Ou', {
    name: 'Ou',
    parentId: 'r-abcd',
  })
  const accounts = new AccountsStack(app, 'Consumer', {
    ...props,
    parentOuId: ou.attrId,
  })
  Template.fromStack(accounts).hasResourceProperties(
    'AWS::Organizations::Account',
    {
      ParentIds: [
        { 'Fn::GetStackOutput': Match.objectLike({ StackName: 'Producer' }) },
      ],
    }
  )
})
