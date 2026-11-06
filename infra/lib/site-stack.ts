import { join } from 'node:path'
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import {
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
// Not termination protected: everything in it is rebuilt from this repo.
// The bucket is retained, CDK's default, so a deleted stack leaves its files.
export class SiteStack extends Stack {
  readonly distribution: Distribution

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props)

    const bucket = new Bucket(this, 'Content', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: BucketEncryption.S3_MANAGED,
    })

    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'harpguru-security-headers',
      comment: 'Security headers for harpguru.com',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          preload: false,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: CONTENT_SECURITY_POLICY,
          override: true,
        },
      },
    })

    // Depends on the Host header, so it is a function, not configuration.
    const wwwRedirect = new CloudFrontFunction(this, 'WwwRedirect', {
      functionName: 'harpguru-www-redirect',
      comment: 'Redirects www.harpguru.com to the apex',
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromFile({
        filePath: join(__dirname, 'functions', 'www-redirect.js'),
      }),
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
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          {
            function: wwwRedirect,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      // CloudFront may not list the bucket, so S3 answers a missing file
      // with 403, not 404. Both become a 404 with a page of our own.
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
  }
}
