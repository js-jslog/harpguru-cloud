import { Match, Template } from 'aws-cdk-lib/assertions'
import { DnsStack, MAIL_HOST_IP } from '../lib/dns-stack'
import { appWithFlags } from './app'

const synth = () => Template.fromStack(new DnsStack(appWithFlags(), 'Dns', {}))

test('the zone is public, for harpguru.com, and retained', () => {
  synth().hasResource('AWS::Route53::HostedZone', {
    // A zone attached to a VPC would be private, answering only inside it.
    Properties: { Name: 'harpguru.com.', VPCs: Match.absent() },
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  })
})

test('mail keeps working: MX 10 mail.harpguru.com, and mail points at Heart', () => {
  const template = synth()
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: 'harpguru.com.',
    Type: 'MX',
    ResourceRecords: ['10 mail.harpguru.com'],
  })
  template.hasResourceProperties('AWS::Route53::RecordSet', {
    Name: 'mail.harpguru.com.',
    Type: 'A',
    ResourceRecords: [MAIL_HOST_IP],
  })
})

test('the stack holds the zone and the two mail records, and nothing else', () => {
  const resources = Object.values(synth().toJSON().Resources) as {
    Type: string
  }[]
  expect(resources.map((r) => r.Type).sort()).toEqual([
    'AWS::Route53::HostedZone',
    'AWS::Route53::RecordSet',
    'AWS::Route53::RecordSet',
  ])
})

test('the nameservers are an output, for typing into Heart', () => {
  synth().hasOutput('NameServers', {})
})
