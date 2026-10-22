import { Match, Template } from 'aws-cdk-lib/assertions'
import { BreakGlassStack } from '../lib/break-glass-stack'
import { applyProjectTags } from '../lib/tags'
import { appWithFlags } from './app'

const synth = () => {
  const app = appWithFlags()
  applyProjectTags(app)
  const stack = new BreakGlassStack(app, 'BreakGlass', {
    env: { account: '222222222222', region: 'eu-west-2' },
    managementAccountId: '111111111111',
  })
  return Template.fromStack(stack)
}

// An import adopts what exists and changes nothing, so this is the role
// exactly as Organizations made it, as read on 2026-10-22.
test('the role matches the one Organizations made', () => {
  synth().templateMatches({
    Resources: {
      OrganizationAccountAccessRole: {
        Type: 'AWS::IAM::Role',
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
        Properties: {
          RoleName: 'OrganizationAccountAccessRole',
          ManagedPolicyArns: ['arn:aws:iam::aws:policy/AdministratorAccess'],
          Tags: Match.absent(),
          Policies: Match.absent(),
          PermissionsBoundary: Match.absent(),
        },
      },
    },
  })
})

test('only the management account may assume it', () => {
  synth().hasResourceProperties('AWS::IAM::Role', {
    AssumeRolePolicyDocument: {
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: 'arn:aws:iam::111111111111:root' },
          Action: 'sts:AssumeRole',
        },
      ],
    },
  })
})
