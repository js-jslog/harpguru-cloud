import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { CertificateStack } from '../lib/certificate-stack'
import { DnsStack } from '../lib/dns-stack'
import {
  AASA_PATH,
  CONTENT_SECURITY_POLICY,
  SITE_DIR,
  SiteStack,
} from '../lib/site-stack'
import { appWithFlags } from './app'

const ACCOUNT = '111111111111'

// As the real app has them: zone and site in London, certificate in us-east-1.
const synth = () => {
  const app = appWithFlags()
  const env = { account: ACCOUNT, region: 'eu-west-2' }
  const dns = new DnsStack(app, 'Dns', { env })
  const certificate = new CertificateStack(app, 'Certificate', {
    env: { account: ACCOUNT, region: 'us-east-1' },
    zone: dns.zone,
  })
  const site = new SiteStack(app, 'Site', {
    env,
    zone: dns.zone,
    certificate: certificate.certificate,
  })
  return Template.fromStack(site)
}

const distributionConfig = (template: Template) => {
  const [distribution] = Object.values(
    template.findResources('AWS::CloudFront::Distribution')
  ) as { Properties: { DistributionConfig: Record<string, any> } }[]
  return distribution.Properties.DistributionConfig
}

describe('the bucket', () => {
  test('is private and only takes TLS', () => {
    synth().hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  })

  test('is readable only by CloudFront, on behalf of this distribution', () => {
    synth().hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Condition: {
              StringEquals: { 'AWS:SourceArn': Match.anyValue() },
            },
          }),
        ]),
      },
    })
    synth().resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
  })
})

describe('the distribution', () => {
  test('serves the apex and www, over HTTPS only', () => {
    const config = distributionConfig(synth())
    expect(config.Aliases).toEqual(['harpguru.com', 'www.harpguru.com'])
    expect(config.DefaultRootObject).toBe('index.html')
    expect(config.DefaultCacheBehavior.ViewerProtocolPolicy).toBe(
      'redirect-to-https'
    )
    expect(config.ViewerCertificate.MinimumProtocolVersion).toBe('TLSv1.2_2021')
    expect(config.PriceClass).toBe('PriceClass_100')
  })

  test('takes the certificate from us-east-1 as a weak reference', () => {
    const arn = distributionConfig(synth()).ViewerCertificate.AcmCertificateArn
    expect(arn['Fn::GetStackOutput']).toMatchObject({
      StackName: 'Certificate',
      Region: 'us-east-1',
    })
  })

  test('sends the security headers through a response headers policy', () => {
    const template = synth()
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 31536000,
            IncludeSubdomains: false,
            Preload: false,
            Override: true,
          },
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          ContentSecurityPolicy: {
            ContentSecurityPolicy: CONTENT_SECURITY_POLICY,
            Override: true,
          },
        },
      },
    })
    expect(
      distributionConfig(template).DefaultCacheBehavior.ResponseHeadersPolicyId
    ).toBeDefined()
  })

  test('runs the www redirect on every viewer request, and no Lambda@Edge', () => {
    const template = synth()
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: { Runtime: 'cloudfront-js-2.0' },
    })
    const behavior = distributionConfig(template).DefaultCacheBehavior
    expect(behavior.FunctionAssociations).toHaveLength(1)
    expect(behavior.FunctionAssociations[0].EventType).toBe('viewer-request')
    expect(behavior.LambdaFunctionAssociations).toBeUndefined()
  })

  test("answers a missing file with a 404 page, not S3's 403", () => {
    const responses = distributionConfig(synth()).CustomErrorResponses
    expect(responses).toEqual(
      [403, 404].map((ErrorCode) => ({
        ErrorCode,
        ResponseCode: 404,
        ResponsePagePath: '/404.html',
        ErrorCachingMinTTL: 300,
      }))
    )
  })
})

describe('the files', () => {
  const deployments = () =>
    Object.values(synth().findResources('Custom::CDKBucketDeployment')) as {
      Properties: Record<string, any>
    }[]

  test('the AASA file goes up on its own, as application/json', () => {
    const aasa = deployments().find((d) =>
      d.Properties.Include?.includes(AASA_PATH)
    )!
    expect(aasa.Properties.Exclude).toEqual(['*'])
    expect(aasa.Properties.SystemMetadata).toEqual({
      'content-type': 'application/json',
    })
    // Never deletes: that is the other deployment's job.
    expect(aasa.Properties.Prune).toBe(false)
  })

  test('everything else goes up with it left alone, and the cache is cleared once', () => {
    const [files, aasa] = [
      deployments().find((d) => !d.Properties.Include)!,
      deployments().find((d) => d.Properties.Include)!,
    ]
    expect(files.Properties.Exclude).toEqual([AASA_PATH])
    expect(files.Properties.Prune).toBe(true)
    expect(files.Properties.DistributionPaths).toBeUndefined()
    expect(aasa.Properties.DistributionPaths).toEqual(['/*'])
  })

  test('the AASA file lets the app claim /s/* links', () => {
    const aasa = JSON.parse(readFileSync(join(SITE_DIR, AASA_PATH), 'utf8'))
    expect(aasa).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['6XJN2H9VQM.com.jslog.harpguru'],
            components: [{ '/': '/s/*' }],
          },
        ],
      },
    })
  })

  test('assetlinks.json names the package and the Play app signing key', () => {
    const [statement] = JSON.parse(
      readFileSync(join(SITE_DIR, '.well-known', 'assetlinks.json'), 'utf8')
    )
    expect(statement.relation).toEqual([
      'delegate_permission/common.handle_all_urls',
    ])
    expect(statement.target.package_name).toBe('com.jslog.harpguru')
    expect(statement.target.sha256_cert_fingerprints).toHaveLength(1)
    expect(statement.target.sha256_cert_fingerprints[0]).toMatch(
      /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
    )
  })
})

test('the apex and www each get an A and an AAAA alias to CloudFront', () => {
  const records = Object.values(
    synth().findResources('AWS::Route53::RecordSet')
  ) as { Properties: Record<string, any> }[]
  const pairs = records.map((r) => `${r.Properties.Name} ${r.Properties.Type}`)
  expect(pairs.sort()).toEqual([
    'harpguru.com. A',
    'harpguru.com. AAAA',
    'www.harpguru.com. A',
    'www.harpguru.com. AAAA',
  ])
  for (const r of records) {
    expect(r.Properties.AliasTarget.DNSName).toBeDefined()
  }
})

describe('the www redirect function', () => {
  // The function file is plain JavaScript for CloudFront's runtime, so the
  // test runs it as CloudFront would: call handler with a viewer request.
  const handler = new Function(
    `${readFileSync(join(__dirname, '..', 'lib', 'functions', 'www-redirect.js'), 'utf8')}; return handler`
  )() as (event: unknown) => any

  const request = (
    host: string,
    uri = '/',
    querystring: Record<string, unknown> = {}
  ) => ({
    request: { uri, querystring, headers: { host: { value: host } } },
  })

  test('sends www to the apex, keeping the path', () => {
    const response = handler(request('www.harpguru.com', '/s/abc'))
    expect(response.statusCode).toBe(301)
    expect(response.headers.location.value).toBe('https://harpguru.com/s/abc')
  })

  test('keeps the query string, repeated keys included', () => {
    const response = handler(
      request('www.harpguru.com', '/', {
        a: { value: '1' },
        b: { value: '2', multiValue: [{ value: '2' }, { value: '3' }] },
        flag: { value: '' },
      })
    )
    expect(response.headers.location.value).toBe(
      'https://harpguru.com/?a=1&b=2&b=3&flag'
    )
  })

  test('passes the apex through untouched, .well-known included', () => {
    const event = request('harpguru.com', `/${AASA_PATH}`)
    expect(handler(event)).toBe(event.request)
  })
})
