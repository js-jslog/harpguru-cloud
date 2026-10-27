import { Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53'
import {
  CONTACT_ADDRESS,
  MailCanaryStack,
  SENDER_ADDRESS,
} from '../lib/mail-canary-stack'
import { appWithFlags } from './app'

const FORWARDING_ADDRESS = 'someone@example.com'

const synth = () => {
  const app = appWithFlags()
  const zone = new PublicHostedZone(new Stack(app, 'Dns'), 'Zone', {
    zoneName: 'harpguru.com',
  })
  return Template.fromStack(
    new MailCanaryStack(app, 'Canary', {
      zone,
      forwardingAddress: FORWARDING_ADDRESS,
    })
  )
}

const inputs = (template: Template) =>
  Object.values(template.findResources('AWS::Scheduler::Schedule')).map((s) =>
    JSON.parse(s.Properties.Target.Input)
  )

test('the domain is an identity with DKIM, and its three records go in the zone', () => {
  const template = synth()
  template.hasResourceProperties('AWS::SES::EmailIdentity', {
    EmailIdentity: 'harpguru.com',
  })
  template.resourcePropertiesCountIs(
    'AWS::Route53::RecordSet',
    { Type: 'CNAME' },
    3
  )
})

test('the forwarding address is an identity, so the sandbox may send to it', () => {
  synth().hasResourceProperties('AWS::SES::EmailIdentity', {
    EmailIdentity: FORWARDING_ADDRESS,
  })
})

test('two schedules, Mondays at nine, London time', () => {
  const template = synth()
  template.resourceCountIs('AWS::Scheduler::Schedule', 2)
  template.allResourcesProperties('AWS::Scheduler::Schedule', {
    ScheduleExpression: 'cron(0 9 ? * MON *)',
    ScheduleExpressionTimezone: 'Europe/London',
    FlexibleTimeWindow: { Mode: 'OFF' },
    State: 'ENABLED',
    // A universal target: Scheduler calls SES's SendEmail itself.
    Target: Match.objectLike({
      Arn: {
        'Fn::Join': [
          '',
          Match.arrayWith([':scheduler:::aws-sdk:sesv2:sendEmail']),
        ],
      },
    }),
  })
})

test('one send to each address, never one message to both', () => {
  const sends = inputs(synth())
  expect(sends.map((i) => i.Destination.ToAddresses).sort()).toEqual([
    [CONTACT_ADDRESS],
    [FORWARDING_ADDRESS],
  ])
  for (const send of sends) {
    expect(send.FromEmailAddress).toBe(SENDER_ADDRESS)
  }
})

test("the schedules' role may send as ses:, not the universal target's sesv2: guess", () => {
  const template = synth()
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Action: 'ses:SendEmail', Effect: 'Allow' }),
      ]),
    },
  })
  const actions = JSON.stringify(
    Object.values(template.findResources('AWS::IAM::Policy'))
  )
  expect(actions).not.toMatch(/sesv2:/)
})
