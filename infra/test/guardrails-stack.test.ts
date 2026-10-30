import { Match, Template } from 'aws-cdk-lib/assertions'
import {
  ALLOWED_REGIONS,
  CDK_EXEC_ROLE_PATTERN,
  GuardrailsStack,
  SCPS,
} from '../lib/guardrails-stack'
import { applyProjectTags, PROJECT_TAGS } from '../lib/tags'
import { appWithFlags } from './app'

const synth = () => {
  const app = appWithFlags()
  applyProjectTags(app)
  const stack = new GuardrailsStack(app, 'Guardrails', {
    organizationRootId: 'r-abcd',
  })
  return Template.fromStack(stack)
}

test('the Workloads OU sits directly under the root', () => {
  synth().hasResourceProperties('AWS::Organizations::OrganizationalUnit', {
    Name: 'Workloads',
    ParentId: 'r-abcd',
  })
})

test('there are exactly four SCPs, all attached to the OU', () => {
  const template = synth()
  template.resourceCountIs('AWS::Organizations::Policy', 4)
  for (const name of Object.keys(SCPS)) {
    template.hasResourceProperties('AWS::Organizations::Policy', {
      Name: name,
      Type: 'SERVICE_CONTROL_POLICY',
      TargetIds: [{ 'Fn::GetAtt': ['Workloads', 'Id'] }],
    })
  }
})

test('the region lock allows exactly London and us-east-1', () => {
  expect(ALLOWED_REGIONS).toEqual(['eu-west-2', 'us-east-1'])
  synth().hasResourceProperties('AWS::Organizations::Policy', {
    Name: 'harpguru-region-lock',
    Content: {
      Statement: [
        Match.objectLike({
          Effect: 'Deny',
          Condition: {
            StringNotEquals: { 'aws:RequestedRegion': ALLOWED_REGIONS },
          },
        }),
      ],
    },
  })
})

test("Config can't be stopped, narrowed or redirected, except by CDK's deploys", () => {
  const [statement] = SCPS['harpguru-protect-config'].content.Statement
  expect(statement.Action).toEqual(
    expect.arrayContaining([
      'config:StopConfigurationRecorder',
      'config:DeleteConfigurationRecorder',
      'config:DeleteDeliveryChannel',
      'config:PutConfigurationRecorder',
      'config:PutDeliveryChannel',
    ])
  )
  expect(statement.Condition).toEqual({
    ArnNotLike: { 'aws:PrincipalArn': CDK_EXEC_ROLE_PATTERN },
  })
  // The bootstrap qualifier and role name CDK's deploys actually use.
  expect(CDK_EXEC_ROLE_PATTERN).toBe(
    'arn:aws:iam::*:role/cdk-hnb659fds-cfn-exec-role-*'
  )
})

test('every SCP only denies; none grants anything', () => {
  for (const { content } of Object.values(SCPS)) {
    for (const statement of content.Statement) {
      expect(statement.Effect).toBe('Deny')
    }
  }
})

test('every SCP fits the 10,240-character limit', () => {
  for (const { content } of Object.values(SCPS)) {
    expect(JSON.stringify(content).length).toBeLessThan(10240)
  }
})

test('the OU and policies carry the project tags', () => {
  // CDK sorts tags by key, and arrayWith matches in order.
  const tags = Match.arrayWith(
    Object.entries(PROJECT_TAGS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([Key, Value]) => ({ Key, Value }))
  )
  const template = synth()
  template.hasResourceProperties('AWS::Organizations::OrganizationalUnit', {
    Tags: tags,
  })
  template.allResourcesProperties('AWS::Organizations::Policy', { Tags: tags })
})
