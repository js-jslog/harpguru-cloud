import { Template } from 'aws-cdk-lib/assertions'
import { CertificateStack } from '../lib/certificate-stack'
import { DnsStack } from '../lib/dns-stack'
import {
  REQUEST_LOG_FIELDS,
  REQUEST_LOG_PREFIX,
  REQUEST_LOG_RETENTION_DAYS,
  REQUEST_LOG_SOURCE_NAME,
  REQUEST_LOG_SUFFIX,
  RequestLogsStack,
} from '../lib/request-logs-stack'
import { SiteStack } from '../lib/site-stack'
import { appWithFlags } from './app'

const ACCOUNT = '111111111111'

// As the real app has them: the site and its logs bucket in London, the
// certificate and the log delivery in us-east-1.
const synth = () => {
  const app = appWithFlags()
  const london = { account: ACCOUNT, region: 'eu-west-2' }
  const edge = { account: ACCOUNT, region: 'us-east-1' }
  const dns = new DnsStack(app, 'Dns', { env: london })
  const certificate = new CertificateStack(app, 'Certificate', {
    env: edge,
    zone: dns.zone,
  })
  const site = new SiteStack(app, 'Site', {
    env: london,
    zone: dns.zone,
    certificate: certificate.certificate,
  })
  const logs = new RequestLogsStack(app, 'RequestLogs', {
    env: edge,
    distribution: site.distribution,
    bucket: site.requestLogsBucket,
  })
  return { logs: Template.fromStack(logs), site: Template.fromStack(site) }
}

const only = (template: Template, type: string) => {
  const resources = Object.entries(template.findResources(type))
  expect(resources).toHaveLength(1)
  const [[id, resource]] = resources as [string, any][]
  return { id, ...resource }
}

const logsBucket = (site: Template) => {
  const [entry] = Object.entries(site.findResources('AWS::S3::Bucket')).filter(
    ([id]) => id.startsWith('RequestLogs')
  ) as [string, any][]
  return { id: entry[0], ...entry[1] }
}

describe('the logs bucket, in HarpguruSite', () => {
  test('deletes each file after the retention the user chose', () => {
    const { Properties } = logsBucket(synth().site)
    expect(REQUEST_LOG_RETENTION_DAYS).toBe(90)
    expect(Properties.LifecycleConfiguration.Rules).toEqual([
      expect.objectContaining({ ExpirationInDays: 90, Status: 'Enabled' }),
    ])
  })

  test('ignores ACLs, and has a name fixed at synthesis for the edge stack', () => {
    const { Properties } = logsBucket(synth().site)
    expect(Properties.OwnershipControls.Rules).toEqual([
      { ObjectOwnership: 'BucketOwnerEnforced' },
    ])
    expect(typeof Properties.BucketName).toBe('string')
  })

  test('admits the log delivery for this source only, and only under its prefix', () => {
    const { site } = synth()
    const { id } = logsBucket(site)
    const [policy] = Object.values(
      site.findResources('AWS::S3::BucketPolicy', {
        Properties: { Bucket: { Ref: id } },
      })
    ) as any[]
    const statements = policy.Properties.PolicyDocument.Statement.filter(
      (s: any) => s.Principal?.Service === 'delivery.logs.amazonaws.com'
    )
    const sourceArn = `arn:aws:logs:us-east-1:${ACCOUNT}:delivery-source:${REQUEST_LOG_SOURCE_NAME}`
    expect(statements).toHaveLength(2)
    for (const s of statements) {
      expect(s.Effect).toBe('Allow')
      expect(s.Condition.StringEquals['aws:SourceAccount']).toBe(ACCOUNT)
      expect(s.Condition.ArnLike).toEqual({ 'aws:SourceArn': sourceArn })
    }
    const write = statements.find((s: any) => s.Action === 's3:PutObject')
    expect(write.Condition.StringEquals['s3:x-amz-acl']).toBe(
      'bucket-owner-full-control'
    )
    expect(write.Resource['Fn::Join'][1][1]).toBe(`/${REQUEST_LOG_PREFIX}/*`)
  })
})

describe('the log delivery, in us-east-1', () => {
  test('takes the access logs of the site distribution, read from London', () => {
    const { Properties } = only(synth().logs, 'AWS::Logs::DeliverySource')
    expect(Properties.Name).toBe(REQUEST_LOG_SOURCE_NAME)
    expect(Properties.LogType).toBe('ACCESS_LOGS')
    const [, [prefix, id]] = Properties.ResourceArn['Fn::Join']
    expect(prefix).toBe(`arn:aws:cloudfront::${ACCOUNT}:distribution/`)
    expect(id['Fn::GetStackOutput']).toMatchObject({
      StackName: 'Site',
      Region: 'eu-west-2',
    })
  })

  test("writes JSON under the logs bucket's prefix", () => {
    const { site, logs } = synth()
    const bucketName = logsBucket(site).Properties.BucketName
    const { Properties } = only(logs, 'AWS::Logs::DeliveryDestination')
    expect(Properties.OutputFormat).toBe('json')
    expect(Properties.DestinationResourceArn).toBe(
      `arn:aws:s3:::${bucketName}/${REQUEST_LOG_PREFIX}`
    )
  })

  test('joins the two, by day in Hive-style folders, with the chosen fields', () => {
    const { logs } = synth()
    const destination = only(logs, 'AWS::Logs::DeliveryDestination')
    const delivery = only(logs, 'AWS::Logs::Delivery')
    expect(delivery.Properties).toMatchObject({
      DeliverySourceName: REQUEST_LOG_SOURCE_NAME,
      DeliveryDestinationArn: { 'Fn::GetAtt': [destination.id, 'Arn'] },
      S3SuffixPath: REQUEST_LOG_SUFFIX,
      S3EnableHiveCompatiblePath: true,
      RecordFields: REQUEST_LOG_FIELDS,
    })
    expect(delivery.DependsOn).toEqual([
      only(logs, 'AWS::Logs::DeliverySource').id,
    ])
  })

  test('keeps no cookies, and adds the country and the behaviour', () => {
    expect(REQUEST_LOG_FIELDS).not.toContain('cs(Cookie)')
    expect(REQUEST_LOG_FIELDS).toEqual(
      expect.arrayContaining(['c-ip', 'cs-uri-query', 'cs(Referer)'])
    )
    expect(REQUEST_LOG_FIELDS).toEqual(
      expect.arrayContaining(['c-country', 'cache-behavior-path-pattern'])
    )
  })
})
