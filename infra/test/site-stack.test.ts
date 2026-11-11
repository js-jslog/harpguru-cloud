import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Template } from 'aws-cdk-lib/assertions'
import { CertificateStack } from '../lib/certificate-stack'
import { DnsStack } from '../lib/dns-stack'
import { EMBED_PARTNER_ORIGINS } from '../lib/partners'
import {
  AASA_PATH,
  CONTENT_SECURITY_POLICY,
  EMBED_CONTENT_SECURITY_POLICY,
  PAGE_PATHS,
  PAGES_CONTENT_SECURITY_POLICY,
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

// The site's bucket, and from Phase B the widget pages' bucket and the
// request logs' bucket, built alike. CDK's own bucket for the upload's assets
// is not in this stack.
describe('the buckets', () => {
  test('there are three, and all block all public access', () => {
    const buckets = Object.values(synth().findResources('AWS::S3::Bucket')) as {
      Properties: Record<string, any>
    }[]
    expect(buckets).toHaveLength(3)
    for (const bucket of buckets) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      })
    }
  })

  test('all take only TLS', () => {
    const policies = Object.values(
      synth().findResources('AWS::S3::BucketPolicy')
    ) as { Properties: { PolicyDocument: { Statement: any[] } } }[]
    expect(policies).toHaveLength(3)
    for (const policy of policies) {
      expect(policy.Properties.PolicyDocument.Statement).toContainEqual(
        expect.objectContaining({
          Effect: 'Deny',
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        })
      )
    }
  })

  test('the site and the pages are readable only by CloudFront for this distribution', () => {
    const template = synth()
    const policies = Object.entries(
      template.findResources('AWS::S3::BucketPolicy')
    )
      .filter(([id]) => !id.startsWith('RequestLogs'))
      .map(([, p]) => p) as {
      Properties: { PolicyDocument: { Statement: any[] } }
    }[]
    expect(policies).toHaveLength(2)
    for (const policy of policies) {
      expect(policy.Properties.PolicyDocument.Statement).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          expect.objectContaining({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
            Condition: {
              StringEquals: { 'AWS:SourceArn': expect.anything() },
            },
          }),
        ])
      )
    }
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2)
  })

  test('nothing in this repo uploads to the pages bucket', () => {
    const template = synth()
    const pagesBucket = Object.entries(
      template.findResources('AWS::S3::Bucket')
    ).find(([id]) => id.startsWith('Pages'))![0]
    const deployments = Object.values(
      template.findResources('Custom::CDKBucketDeployment')
    ) as { Properties: Record<string, any> }[]
    for (const d of deployments) {
      expect(d.Properties.DestinationBucketName).not.toEqual({
        Ref: pagesBucket,
      })
    }
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

  test('runs the one function on every viewer request, on every behaviour, and no Lambda@Edge', () => {
    const template = synth()
    template.resourceCountIs('AWS::CloudFront::Function', 1)
    template.hasResourceProperties('AWS::CloudFront::Function', {
      Name: 'harpguru-viewer-request',
      FunctionConfig: { Runtime: 'cloudfront-js-2.0' },
    })
    const config = distributionConfig(template)
    for (const behavior of [
      config.DefaultCacheBehavior,
      ...config.CacheBehaviors,
    ]) {
      expect(behavior.FunctionAssociations).toHaveLength(1)
      expect(behavior.FunctionAssociations[0].EventType).toBe('viewer-request')
      expect(behavior.LambdaFunctionAssociations).toBeUndefined()
    }
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

// AWS's managed CachingOptimized policy: the cache key is the path alone.
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6'

describe('the widget pages', () => {
  const behaviors = () =>
    distributionConfig(synth()).CacheBehaviors as Record<string, any>[]
  const originOf = (template: Template, path: string) => {
    const config = distributionConfig(template)
    const behavior = config.CacheBehaviors.find(
      (b: any) => b.PathPattern === path
    )
    return config.Origins.find((o: any) => o.Id === behavior.TargetOriginId)
  }

  test('/w/, /t/, /s/ and /e/ each have a behaviour, HTTPS only', () => {
    expect(behaviors().map((b) => b.PathPattern)).toEqual([...PAGE_PATHS])
    for (const b of behaviors()) {
      expect(b.ViewerProtocolPolicy).toBe('redirect-to-https')
    }
  })

  test('they come from the pages bucket, not the site bucket', () => {
    const template = synth()
    const config = distributionConfig(template)
    expect(config.Origins).toHaveLength(2)
    const site = config.Origins.find(
      (o: any) => o.Id === config.DefaultCacheBehavior.TargetOriginId
    )
    for (const path of PAGE_PATHS) {
      const origin = originOf(template, path)
      expect(origin.Id).not.toBe(site.Id)
      expect(origin.DomainName['Fn::GetAtt'][0]).toMatch(/^Pages/)
    }
  })

  test('every behaviour caches by path alone, so a query string is one cached copy', () => {
    const config = distributionConfig(synth())
    for (const b of [config.DefaultCacheBehavior, ...config.CacheBehaviors]) {
      expect(b.CachePolicyId).toBe(CACHING_OPTIMIZED)
    }
  })

  test('/e/ may be framed by harpguru.com and the partners; nothing else may', () => {
    const template = synth()
    const policies = Object.values(
      template.findResources('AWS::CloudFront::ResponseHeadersPolicy')
    ) as { Properties: { ResponseHeadersPolicyConfig: Record<string, any> } }[]
    const byName: Record<string, any> = Object.fromEntries(
      policies.map((p) => [
        p.Properties.ResponseHeadersPolicyConfig.Name,
        p.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig,
      ])
    )
    expect(Object.keys(byName).sort()).toEqual([
      'harpguru-embed-headers',
      'harpguru-pages-headers',
      'harpguru-security-headers',
    ])

    const embed = byName['harpguru-embed-headers']
    expect(embed.FrameOptions).toBeUndefined()
    expect(embed.ContentSecurityPolicy.ContentSecurityPolicy).toBe(
      EMBED_CONTENT_SECURITY_POLICY
    )
    expect(EMBED_CONTENT_SECURITY_POLICY).toContain(
      `frame-ancestors ${["'self'", ...EMBED_PARTNER_ORIGINS].join(' ')}`
    )

    const pages = byName['harpguru-pages-headers']
    expect(pages.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true })
    expect(pages.ContentSecurityPolicy.ContentSecurityPolicy).toBe(
      PAGES_CONTENT_SECURITY_POLICY
    )
    expect(PAGES_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")

    // HSTS, nosniff and the referrer policy are the same on all three.
    for (const config of Object.values(byName)) {
      expect(config.StrictTransportSecurity).toEqual(
        byName['harpguru-security-headers'].StrictTransportSecurity
      )
      expect(config.ContentTypeOptions).toEqual({ Override: true })
      expect(config.ReferrerPolicy).toEqual(
        byName['harpguru-security-headers'].ReferrerPolicy
      )
    }
  })

  test('only /e/ gets the embed policy', () => {
    const template = synth()
    const ids = Object.fromEntries(
      Object.entries(
        template.findResources('AWS::CloudFront::ResponseHeadersPolicy')
      ).map(([id, p]: [string, any]) => [
        p.Properties.ResponseHeadersPolicyConfig.Name,
        id,
      ])
    )
    for (const b of distributionConfig(template).CacheBehaviors) {
      expect(b.ResponseHeadersPolicyId).toEqual({
        Ref:
          b.PathPattern === '/e/*'
            ? ids['harpguru-embed-headers']
            : ids['harpguru-pages-headers'],
      })
    }
  })

  test('the widget may run only its own scripts, and no eval', () => {
    for (const policy of [
      PAGES_CONTENT_SECURITY_POLICY,
      EMBED_CONTENT_SECURITY_POLICY,
    ]) {
      expect(policy).toContain("script-src 'self';")
      expect(policy).not.toContain('unsafe-eval')
      expect(policy).toContain("default-src 'none'")
    }
  })

  test('partner origins are bare https origins', () => {
    for (const origin of EMBED_PARTNER_ORIGINS) {
      expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+(:\d+)?$/)
    }
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

  // Exactly /s/, whatever the query: /s/web?… is the open-in-browser marker,
  // and must stay in the browser.
  test('the AASA file lets the app claim /s/ links, and only /s/', () => {
    const aasa = JSON.parse(readFileSync(join(SITE_DIR, AASA_PATH), 'utf8'))
    expect(aasa).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['6XJN2H9VQM.com.jslog.harpguru'],
            components: [{ '/': '/s/' }],
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

describe('the viewer request function', () => {
  // The function file is plain JavaScript for CloudFront's runtime, so the
  // test runs it as CloudFront would: call handler with a viewer request.
  const handler = new Function(
    `${readFileSync(join(__dirname, '..', 'lib', 'functions', 'viewer-request.js'), 'utf8')}; return handler`
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
    for (const uri of [`/${AASA_PATH}`, '/', '/index.html', '/styles.css']) {
      const event = request('harpguru.com', uri)
      expect(handler(event)).toBe(event.request)
      expect(event.request.uri).toBe(uri)
    }
  })

  test('redirects www before mapping, so www never serves a widget page', () => {
    const response = handler(
      request('www.harpguru.com', '/t/country', { k: { value: 'C' } })
    )
    expect(response.statusCode).toBe(301)
    expect(response.headers.location.value).toBe(
      'https://harpguru.com/t/country?k=C'
    )
  })

  const mapped = (uri: string, querystring = {}) => {
    const result = handler(request('harpguru.com', uri, querystring))
    expect(result.statusCode).toBeUndefined()
    return result.uri
  }

  test('maps every setup link and embed to its one shell', () => {
    for (const uri of ['/s/', '/s/anything', '/s/a/b.js']) {
      expect(mapped(uri)).toBe('/s/index.html')
    }
    for (const uri of ['/e/', '/e/anything']) {
      expect(mapped(uri)).toBe('/e/index.html')
    }
  })

  test("maps a tuning's path to its page, with or without a slash", () => {
    expect(mapped('/t/country')).toBe('/t/country/index.html')
    expect(mapped('/t/country/')).toBe('/t/country/index.html')
    expect(mapped('/t/')).toBe('/t/index.html')
  })

  test('leaves a path with a file extension, and the bundle, alone', () => {
    expect(mapped('/t/country/card.png')).toBe('/t/country/card.png')
    expect(mapped('/w/_expo/static/js/web/index-abc.js')).toBe(
      '/w/_expo/static/js/web/index-abc.js'
    )
  })

  test('leaves the query string for the page to read', () => {
    const query = { k: { value: 'C' }, p: { value: '2' } }
    const result = handler(request('harpguru.com', '/s/', query))
    expect(result.uri).toBe('/s/index.html')
    expect(result.querystring).toBe(query)
  })

  test('adds the slash to /t, /s and /e, keeping the query string', () => {
    for (const path of ['/t', '/s', '/e']) {
      const response = handler(
        request('harpguru.com', path, { k: { value: 'C' } })
      )
      expect(response.statusCode).toBe(301)
      expect(response.headers.location.value).toBe(`${path}/?k=C`)
    }
  })
})
