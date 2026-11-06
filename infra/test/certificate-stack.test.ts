import { Template } from 'aws-cdk-lib/assertions'
import { CertificateStack } from '../lib/certificate-stack'
import { DnsStack } from '../lib/dns-stack'
import { appWithFlags } from './app'

const ACCOUNT = '111111111111'

// The same two stacks as the real app: the zone in London, the certificate in
// us-east-1, so the test sees the reference cross regions as it really does.
const synth = () => {
  const app = appWithFlags()
  const dns = new DnsStack(app, 'Dns', {
    env: { account: ACCOUNT, region: 'eu-west-2' },
  })
  const stack = new CertificateStack(app, 'Certificate', {
    env: { account: ACCOUNT, region: 'us-east-1' },
    zone: dns.zone,
  })
  return {
    dns: Template.fromStack(dns),
    certificate: Template.fromStack(stack),
  }
}

test('one certificate, for the apex and www, validated through DNS', () => {
  const { certificate } = synth()
  certificate.resourceCountIs('AWS::CertificateManager::Certificate', 1)
  certificate.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: 'harpguru.com',
    SubjectAlternativeNames: ['www.harpguru.com'],
    ValidationMethod: 'DNS',
  })
})

test('both names validate in the zone, so CloudFormation writes the records', () => {
  const { certificate } = synth()
  const [cert] = Object.values(
    certificate.findResources('AWS::CertificateManager::Certificate')
  ) as { Properties: { DomainValidationOptions: unknown[] } }[]
  const options = cert.Properties.DomainValidationOptions as {
    DomainName: string
    HostedZoneId: unknown
  }[]
  expect(options.map((o) => o.DomainName).sort()).toEqual([
    'harpguru.com',
    'www.harpguru.com',
  ])
  for (const o of options) expect(o.HostedZoneId).toBeDefined()
})

test('the zone arrives as a weak reference: an output, not an export or a custom resource', () => {
  const { dns, certificate } = synth()
  const [cert] = Object.values(
    certificate.findResources('AWS::CertificateManager::Certificate')
  ) as {
    Properties: { DomainValidationOptions: { HostedZoneId: unknown }[] }
  }[]
  expect(
    JSON.stringify(cert.Properties.DomainValidationOptions[0].HostedZoneId)
  ).toContain('Fn::GetStackOutput')

  const outputs = Object.values(dns.toJSON().Outputs ?? {}) as {
    Export?: unknown
  }[]
  expect(outputs.some((o) => o.Export)).toBe(false)
  for (const template of [dns, certificate]) {
    const types = Object.values(template.toJSON().Resources).map(
      (r) => (r as { Type: string }).Type
    )
    expect(types.filter((t) => t.startsWith('Custom::'))).toEqual([])
  }
})

test('the stack holds the certificate and nothing else', () => {
  const resources = Object.values(synth().certificate.toJSON().Resources) as {
    Type: string
  }[]
  expect(resources.map((r) => r.Type)).toEqual([
    'AWS::CertificateManager::Certificate',
  ])
})
