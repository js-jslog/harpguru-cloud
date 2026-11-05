import { Match, Template } from 'aws-cdk-lib/assertions'
import { FINDINGS_ALERT_NAME, GuardDutyStack } from '../lib/guardduty-stack'
import { appWithFlags } from './app'

const template = Template.fromStack(
  new GuardDutyStack(appWithFlags(), 'GuardDuty', {
    env: { account: '111122223333', region: 'eu-west-2' },
    alertEmail: 'alerts@example.com',
  })
)

test('one detector, switched on', () => {
  template.resourceCountIs('AWS::GuardDuty::Detector', 1)
  template.hasResourceProperties('AWS::GuardDuty::Detector', { Enable: true })
})

// Decided with the plan: protection plans stay at GuardDuty's defaults, so
// none is written into the template, where it would override them.
test('no protection plan is set, so GuardDuty chooses', () => {
  const [detector] = Object.values(
    template.findResources('AWS::GuardDuty::Detector')
  )
  expect(detector.Properties.Features).toBeUndefined()
  expect(detector.Properties.DataSources).toBeUndefined()
})

test('every finding, of any severity, is emailed', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Name: FINDINGS_ALERT_NAME,
    EventPattern: {
      source: ['aws.guardduty'],
      'detail-type': ['GuardDuty Finding'],
    },
    State: 'ENABLED',
  })
  const [rule] = Object.values(template.findResources('AWS::Events::Rule'))
  expect(rule.Properties.EventPattern.detail).toBeUndefined()
  template.hasResourceProperties('AWS::SNS::Topic', {
    TopicName: FINDINGS_ALERT_NAME,
  })
  template.hasResourceProperties('AWS::SNS::Subscription', {
    Protocol: 'email',
    Endpoint: 'alerts@example.com',
  })
})

test('the email says what was found, not only the raw event', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    Targets: [
      Match.objectLike({
        InputTransformer: Match.objectLike({
          InputPathsMap: Match.objectLike({
            'detail-title': '$.detail.title',
            'detail-severity': '$.detail.severity',
          }),
        }),
      }),
    ],
  })
})

test("only this stack's rule may publish to the topic", () => {
  const [policy] = Object.values(
    template.findResources('AWS::SNS::TopicPolicy')
  )
  const statements = policy.Properties.PolicyDocument.Statement
  expect(statements).toHaveLength(1)
  expect(statements[0].Principal).toEqual({ Service: 'events.amazonaws.com' })
  expect(statements[0].Action).toBe('sns:Publish')
  const [ruleId] = Object.keys(template.findResources('AWS::Events::Rule'))
  expect(statements[0].Condition).toEqual({
    ArnEquals: { 'aws:SourceArn': { 'Fn::GetAtt': [ruleId, 'Arn'] } },
  })
})

test("the address isn't in any logical ID, so it stays out of diffs", () => {
  const ids = Object.keys(template.toJSON().Resources).join(' ')
  expect(ids).not.toMatch(/alerts|example/)
})

// GuardDuty's service-linked roles are its own, and nothing else needs one.
test('the stack makes no IAM role of its own', () => {
  template.resourceCountIs('AWS::IAM::Role', 0)
  template.resourceCountIs('AWS::IAM::ServiceLinkedRole', 0)
})
