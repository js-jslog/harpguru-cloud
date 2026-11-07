import { join } from 'node:path'
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import {
  type BehaviorOptions,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront'
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import {
  AaaaRecord,
  ARecord,
  type IPublicHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53'
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import type { Construct } from 'constructs'
import { WWW_DOMAIN } from './certificate-stack'
import { DOMAIN } from './dns-stack'
import { EMBED_PARTNER_ORIGINS } from './partners'

// The files the site serves, uploaded as they are.
export const SITE_DIR = join(__dirname, '..', 'site')

// Apple fetches this by its exact name, which has no extension, so nothing
// can guess its type. It is uploaded on its own, with the type set by hand.
export const AASA_PATH = '.well-known/apple-app-site-association'

// What a browser should refuse, on every response. A response headers policy
// rather than a function: these never depend on the request, so they are
// configuration, with no code to test and no charge per request.
//
// The page has no scripts, and its styles and image are its own files, so
// the content security policy allows nothing else. HSTS tells a browser to
// use HTTPS for a year; it leaves out subdomains, which this policy can't
// speak for, and the preload list, which is hard to leave.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src 'self'",
  "style-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

// The widget's pages, from Phase B: a prerendered page or a shell, and the
// bundle under /w/ that renders the harp face into it. They may run only the
// bundle's own scripts. Styles allow 'unsafe-inline' because react-native-web
// writes its styles into the page at run time, as <style> rules and style
// attributes; a hash or a nonce can't cover styles made after the page loads.
const widgetPolicy = (frameAncestors: string) =>
  [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ')

// /t/ and /s/: no site may frame them.
export const PAGES_CONTENT_SECURITY_POLICY = widgetPolicy("'none'")

// /e/: harpguru.com itself and the partners in lib/partners.ts may frame it.
export const EMBED_CONTENT_SECURITY_POLICY = widgetPolicy(
  ["'self'", ...EMBED_PARTNER_ORIGINS].join(' ')
)

// The behaviours ahead of the default, each a path pattern served from the
// pages bucket. CloudFront tries them in order and the first match wins; the
// patterns don't overlap, so here the order changes nothing.
export const PAGE_PATHS = ['/w/*', '/t/*', '/s/*', '/e/*'] as const

export type SiteStackProps = StackProps & {
  zone: IPublicHostedZone
  // From HarpguruCertificate in us-east-1, the only region CloudFront takes
  // certificates from. It arrives as a weak reference, read across regions.
  certificate: ICertificate
}

// harpguru.com: a private bucket, read only by one CloudFront distribution,
// which serves the apex and www over HTTPS. www is redirected to the apex by
// a CloudFront Function. The apex serves the landing page and the two
// .well-known files Universal Links and App Links need.
//
// From Phase B it also serves the widget's pages, /t/, /s/ and /e/, and their
// bundle, /w/, from a second bucket. harpguru's deploy workflow fills that
// one; nothing in this repo writes to it.
//
// Not termination protected: everything in it is rebuilt from this repo, or
// from harpguru's. Both buckets are retained, CDK's default, so a deleted
// stack leaves their files.
export class SiteStack extends Stack {
  readonly distribution: Distribution
  readonly pagesBucket: Bucket

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props)

    const privateBucket = (id: string) =>
      new Bucket(this, id, {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        encryption: BucketEncryption.S3_MANAGED,
      })
    const bucket = privateBucket('Content')
    // The widget's pages. A bucket of their own, because the site's upload
    // below deletes anything in its bucket it didn't put there.
    this.pagesBucket = privateBucket('Pages')

    // The same on every response: HSTS for a year, without subdomains, which
    // this policy can't speak for, or the preload list, which is hard to
    // leave; no type sniffing; and no full URLs sent to other sites.
    const commonHeaders = {
      strictTransportSecurity: {
        accessControlMaxAge: Duration.days(365),
        includeSubdomains: false,
        preload: false,
        override: true,
      },
      contentTypeOptions: { override: true },
      referrerPolicy: {
        referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: true,
      },
    }
    const headersPolicy = (
      id: string,
      name: string,
      comment: string,
      contentSecurityPolicy: string,
      frameable: boolean
    ) =>
      new ResponseHeadersPolicy(this, id, {
        responseHeadersPolicyName: name,
        comment,
        securityHeadersBehavior: {
          ...commonHeaders,
          // X-Frame-Options can say DENY or SAMEORIGIN, never a list, so a
          // page partners may frame leaves it out and relies on the CSP's
          // frame-ancestors, which every current browser obeys.
          ...(frameable
            ? {}
            : {
                frameOptions: {
                  frameOption: HeadersFrameOption.DENY,
                  override: true,
                },
              }),
          contentSecurityPolicy: { contentSecurityPolicy, override: true },
        },
      })

    const securityHeaders = headersPolicy(
      'SecurityHeaders',
      'harpguru-security-headers',
      'Security headers for harpguru.com',
      CONTENT_SECURITY_POLICY,
      false
    )
    const pagesHeaders = headersPolicy(
      'PagesHeaders',
      'harpguru-pages-headers',
      'Security headers for the widget pages, which nothing may frame',
      PAGES_CONTENT_SECURITY_POLICY,
      false
    )
    const embedHeaders = headersPolicy(
      'EmbedHeaders',
      'harpguru-embed-headers',
      'Security headers for embeds, which partners may frame',
      EMBED_CONTENT_SECURITY_POLICY,
      true
    )

    // Depends on the Host header and the path, so it is a function, not
    // configuration. Every behaviour runs it, so www redirects on every path.
    const viewerRequest = new CloudFrontFunction(this, 'ViewerRequest', {
      functionName: 'harpguru-viewer-request',
      comment: 'Redirects www to the apex; maps widget paths to their pages',
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromFile({
        filePath: join(__dirname, 'functions', 'viewer-request.js'),
      }),
    })
    const functionAssociations = [
      { function: viewerRequest, eventType: FunctionEventType.VIEWER_REQUEST },
    ]

    // CachingOptimized, AWS's managed cache policy, is the default
    // behaviour's too: the cache key is the path alone, with no query string,
    // headers or cookies, so every configuration of a page is one cached copy.
    // Copies last a day unless the upload says otherwise, and every deploy
    // invalidates.
    const pagesOrigin = S3BucketOrigin.withOriginAccessControl(this.pagesBucket)
    const pageBehavior = (
      responseHeadersPolicy: ResponseHeadersPolicy
    ): BehaviorOptions => ({
      origin: pagesOrigin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy,
      functionAssociations,
    })

    this.distribution = new Distribution(this, 'Distribution', {
      comment: DOMAIN,
      domainNames: [DOMAIN, WWW_DOMAIN],
      certificate: props.certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      // North America and Europe's edge locations only: the cheapest class.
      // Elsewhere, visitors are served from the nearest of those.
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        // OAC: CloudFront signs its requests to the bucket, and the bucket
        // policy CDK writes admits only this distribution.
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations,
      },
      additionalBehaviors: Object.fromEntries(
        PAGE_PATHS.map((path) => [
          path,
          pageBehavior(path === '/e/*' ? embedHeaders : pagesHeaders),
        ])
      ),
      // CloudFront may not list either bucket, so S3 answers a missing file
      // with 403, not 404. Both become a 404 with the site's own page, which
      // CloudFront fetches through the default behaviour.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: Duration.minutes(5),
      })),
    })

    // The upload runs as a custom resource: a Lambda function CDK provides
    // copies the files from CDK's asset bucket, deletes any that are gone,
    // and clears CloudFront's cache so the change shows at once.
    const site = new BucketDeployment(this, 'Files', {
      sources: [Source.asset(SITE_DIR)],
      destinationBucket: bucket,
      // Left to the deployment below. Excluded files are never deleted here.
      exclude: [AASA_PATH],
    })
    const aasa = new BucketDeployment(this, 'AppleAppSiteAssociation', {
      sources: [Source.asset(SITE_DIR)],
      destinationBucket: bucket,
      exclude: ['*'],
      include: [AASA_PATH],
      contentType: 'application/json',
      prune: false,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    })
    // So the cache is cleared once, after every file is in place.
    aasa.node.addDependency(site)

    // Alias records: Route 53 answers with CloudFront's addresses itself, at
    // the apex too, where a CNAME isn't allowed. No charge for the queries.
    const target = RecordTarget.fromAlias(
      new CloudFrontTarget(this.distribution)
    )
    for (const [name, recordName] of [
      ['Apex', DOMAIN],
      ['Www', WWW_DOMAIN],
    ]) {
      new ARecord(this, `${name}A`, { zone: props.zone, recordName, target })
      new AaaaRecord(this, `${name}Aaaa`, {
        zone: props.zone,
        recordName,
        target,
      })
    }

    // For the smoke test and the concepts doc's commands.
    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
    })
    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
    })
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName })
    new CfnOutput(this, 'PagesBucketName', {
      value: this.pagesBucket.bucketName,
    })
  }
}
