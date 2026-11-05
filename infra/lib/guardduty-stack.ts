import { Stack, type StackProps } from 'aws-cdk-lib'
import { EventField, Rule, RuleTargetInput } from 'aws-cdk-lib/aws-events'
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets'
import { CfnDetector } from 'aws-cdk-lib/aws-guardduty'
import {
  type CfnTopicPolicy,
  Subscription,
  SubscriptionProtocol,
  Topic,
} from 'aws-cdk-lib/aws-sns'
import type { Construct } from 'constructs'

// The name of each stack's rule and topic, the same in every account and
// region, so the harpguru-protect-guardduty SCP can name them.
export const FINDINGS_ALERT_NAME = 'harpguru-guardduty-findings'

export type GuardDutyStackProps = StackProps & {
  alertEmail: string
}

// GuardDuty in one account and one region: a detector, which reads that
// region's CloudTrail management events, DNS queries and VPC flow logs
// straight from AWS's side, without any of them being switched on here, and
// raises findings about what looks like an attack. Four of these, one per
// account per region, decided 2026-10-27: standalone, because a delegated
// administrator only earns its keep with more accounts than two.
//
// The optional protection plans are left to GuardDuty's defaults, so they
// aren't in the template or the diff; the plan's step 4c records which were
// on after the deploy. GuardDuty creates its own service-linked roles,
// AWSServiceRoleForAmazonGuardDuty and one for malware protection, with the
// first detector in an account.
export class GuardDutyStack extends Stack {
  constructor(scope: Construct, id: string, props: GuardDutyStackProps) {
    super(scope, id, props)

    // There can be only one detector per account per region. Deleting it
    // deletes its findings, which is why each stack is protected.
    new CfnDetector(this, 'Detector', { enable: true })

    // Findings sit in the console until someone looks, so each one is also
    // emailed. GuardDuty sends every finding to EventBridge in its own
    // region and account, so each detector gets its own rule and topic, and
    // the address confirms four subscriptions. A finding seen again is sent
    // again, at most every six hours, GuardDuty's default. Every severity is
    // sent: in accounts this quiet, a low one is worth reading.
    const topic = new Topic(this, 'FindingsTopic', {
      topicName: FINDINGS_ALERT_NAME,
      displayName: 'Harp Guru GuardDuty',
    })
    // Made directly rather than with EmailSubscription, which builds its
    // construct ID from the address, putting it in every diff.
    new Subscription(this, 'FindingsEmail', {
      topic,
      protocol: SubscriptionProtocol.EMAIL,
      endpoint: props.alertEmail,
    })

    const field = (path: string) => EventField.fromPath(`$.detail.${path}`)
    const rule = new Rule(this, 'FindingsRule', {
      ruleName: FINDINGS_ALERT_NAME,
      description: 'Emails every GuardDuty finding in this account and region',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
      },
      targets: [
        new SnsTopic(topic, {
          message: RuleTargetInput.fromText(
            `GuardDuty finding, severity ${field('severity')}, in account ` +
              `${field('accountId')}, ${field('region')}: ${field('title')}\n\n` +
              `${field('description')}\n\nType: ${field('type')}\n` +
              `Finding ID: ${field('id')}`
          ),
        }),
      ],
    })

    // CDK lets EventBridge publish to the topic for any rule, in any account.
    // Its statement is the topic policy's only one; this limits it to the
    // rule above, against the confused deputy.
    const policy = topic.node.findChild('Policy').node
      .defaultChild as CfnTopicPolicy
    policy.addPropertyOverride('PolicyDocument.Statement.0.Condition', {
      ArnEquals: { 'aws:SourceArn': rule.ruleArn },
    })
  }
}
