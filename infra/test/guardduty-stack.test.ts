import { Template } from 'aws-cdk-lib/assertions'
import { GuardDutyStack } from '../lib/guardduty-stack'
import { appWithFlags } from './app'

const template = Template.fromStack(
  new GuardDutyStack(appWithFlags(), 'GuardDuty', {
    env: { account: '111122223333', region: 'eu-west-2' },
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

// The stack holds the detector alone; its service-linked role is GuardDuty's.
test('the stack makes no IAM role of its own', () => {
  template.resourceCountIs('AWS::IAM::Role', 0)
  template.resourceCountIs('AWS::IAM::ServiceLinkedRole', 0)
})
