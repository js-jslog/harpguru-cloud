import { Stack, TimeZone, type StackProps } from 'aws-cdk-lib'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import {
  Schedule,
  ScheduleExpression,
  ScheduleTargetInput,
} from 'aws-cdk-lib/aws-scheduler'
import { Universal } from 'aws-cdk-lib/aws-scheduler-targets'
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses'
import type { Construct } from 'constructs'
import { DOMAIN } from './dns-stack'

export const CONTACT_ADDRESS = `contact@${DOMAIN}`
export const SENDER_ADDRESS = `canary@${DOMAIN}`

// Mondays at 09:00 London time; Scheduler follows the clock change.
export const SEND_TIME = { weekDay: 'MON', hour: '9', minute: '0' }

export type MailCanaryStackProps = StackProps & {
  zone: IPublicHostedZone
  // Where Heart forwards contact@ to. Kept out of the repo, in
  // deploy.local.json.
  forwardingAddress: string
}

// A weekly end-to-end check that contact@ still forwards. Mail can break
// silently: the zone carries Heart's mail server by IP, and if Heart moves it,
// nothing says so. So two messages go out each week, sent separately:
//   - one straight to the forwarding address, saying to expect the other
//   - one to contact@, which only arrives if forwarding works
// They are separate sends, not one message to two recipients, because Gmail
// hides a second copy of a message it has already delivered: a shared one
// could have its forwarded copy dropped, which is the failure being looked for.
//
// SES stays in its sandbox, which only sends to verified identities. The
// domain covers contact@; the forwarding address is verified by clicking the
// link SES mails to it when this stack deploys.
export class MailCanaryStack extends Stack {
  constructor(scope: Construct, id: string, props: MailCanaryStackProps) {
    super(scope, id, props)

    // Easy DKIM: SES signs each message, and CDK writes the three CNAME
    // records that prove the signature into the zone. SES can only verify
    // them once the public DNS answers from Route 53, after the switch.
    const domain = new EmailIdentity(this, 'Domain', {
      identity: Identity.publicHostedZone(props.zone),
    })
    const forwardingAddress = new EmailIdentity(this, 'ForwardingAddress', {
      identity: Identity.email(props.forwardingAddress),
    })

    // Scheduler calls SES's SendEmail itself, with no Lambda in between. The
    // universal target's default permission would be `sesv2:sendEmail`, but
    // IAM names SES v2's actions `ses:`, so the permission is written out. In
    // the sandbox, SES checks it against the recipient's identity too.
    const sendPermission = new PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [domain.emailIdentityArn, forwardingAddress.emailIdentityArn],
    })

    const weekly = (id: string, to: string, subject: string, body: string) =>
      new Schedule(this, id, {
        description: `Sends "${subject}" to ${to}`,
        schedule: ScheduleExpression.cron({
          ...SEND_TIME,
          timeZone: TimeZone.EUROPE_LONDON,
        }),
        target: new Universal({
          service: 'sesv2',
          action: 'sendEmail',
          policyStatements: [sendPermission],
          input: ScheduleTargetInput.fromObject({
            FromEmailAddress: SENDER_ADDRESS,
            Destination: { ToAddresses: [to] },
            Content: {
              Simple: {
                Subject: { Data: subject },
                Body: { Text: { Data: body } },
              },
            },
          }),
        }),
      })

    weekly(
      'Direct',
      props.forwardingAddress,
      'Harp Guru mail check: direct',
      `This one was sent straight to you. Another, "Harp Guru mail check: ` +
        `via contact@", was sent to ${CONTACT_ADDRESS} at the same time. ` +
        'If it has not arrived beside this one, forwarding is broken: check ' +
        `the MX and mail records for ${DOMAIN}.`
    )
    weekly(
      'ViaContact',
      CONTACT_ADDRESS,
      'Harp Guru mail check: via contact@',
      `This one was sent to ${CONTACT_ADDRESS} and reached you through ` +
        "Heart's forwarding, so mail to the domain works."
    )
  }
}
