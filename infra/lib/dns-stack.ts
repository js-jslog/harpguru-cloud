import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib'
import {
  ARecord,
  MxRecord,
  PublicHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

export const DOMAIN = 'harpguru.com'

// Heart's mail host, which forwards contact@harpguru.com. A different machine
// from the parked web address the apex points at today. Checked 2026-10-26.
export const MAIL_HOST = `mail.${DOMAIN}`
export const MAIL_HOST_IP = '79.170.44.72'

// The same TTL Heart serves these records with.
const TTL = Duration.hours(1)

// The hosted zone for harpguru.com, in the workload account. The registration
// stays with Heart; only the nameservers move, by hand, in Heart's panel.
//
// Nothing is live through this zone until that switch, so deploying it changes
// nothing. After the switch, the zone is the domain: deleting it would take
// mail down, and a new zone would come with new nameservers. Hence Retain.
export class DnsStack extends Stack {
  readonly zone: PublicHostedZone

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.zone = new PublicHostedZone(this, 'Zone', { zoneName: DOMAIN })
    this.zone.applyRemovalPolicy(RemovalPolicy.RETAIN)

    // Mail must survive the switch, so these are in place before it happens.
    new MxRecord(this, 'Mx', {
      zone: this.zone,
      values: [{ priority: 10, hostName: MAIL_HOST }],
      ttl: TTL,
    })
    new ARecord(this, 'MailHost', {
      zone: this.zone,
      recordName: 'mail',
      target: RecordTarget.fromIpAddresses(MAIL_HOST_IP),
      ttl: TTL,
    })

    // The four values to type into Heart's panel.
    new CfnOutput(this, 'NameServers', {
      value: Fn.join(' ', this.zone.hostedZoneNameServers!),
    })
  }
}
