import { Stack, type StackProps } from 'aws-cdk-lib'
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront'
import {
  CfnDelivery,
  CfnDeliveryDestination,
  CfnDeliverySource,
} from 'aws-cdk-lib/aws-logs'
import type { IBucket } from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

// The one delivery source a distribution may have. Named, so the logs
// bucket's policy in HarpguruSite can admit deliveries from this source alone.
export const REQUEST_LOG_SOURCE_NAME = 'harpguru-request-logs'

// Where the logs land in the bucket. For CloudFront, a prefix on the
// destination replaces the default AWSLogs/<account id>/CloudFront/, which
// keeps the account ID out of the keys.
export const REQUEST_LOG_PREFIX = 'cloudfront'

// One folder per day, written Hive's way: year=2026/month=11/day=09, as the
// deploy of 2026-11-09 showed, so that Phase D's Athena table can take its
// partitions from the path.
export const REQUEST_LOG_SUFFIX = '{yyyy}/{MM}/{dd}'

// Kept 90 days, the user's choice, and said so in the privacy notice,
// site/privacy.html. They held viewers' IP addresses until the fields below
// were cut, and the files written before then age out under the same rule.
export const REQUEST_LOG_RETENTION_DAYS = 90

// CloudFront's default fields for S3 as of 2026-11-09, read from
// `aws logs describe-configuration-templates`, with these changes. Cookies
// are left out: harpguru.com sets none, and a log should not keep what it has
// no use for. The viewer's IP address is left out too, from 2026-11-27, in all
// three fields that carry it: c-ip, x-forwarded-for, which holds it when the
// viewer comes through a proxy, and c-port, which means nothing without it.
// Phase D counts pages and countries, not people, and an IP address is
// personal data. CloudFront works out c-country from the address at the edge
// whether or not the address is logged. The country and the behaviour's path
// pattern are added: Phase D counts views per page type and where they come
// from, and neither is a default.
export const REQUEST_LOG_FIELDS = [
  'date',
  'time',
  'x-edge-location',
  'sc-bytes',
  'cs-method',
  'cs(Host)',
  'cs-uri-stem',
  'sc-status',
  'cs(Referer)',
  'cs(User-Agent)',
  'cs-uri-query',
  'x-edge-result-type',
  'x-edge-request-id',
  'x-host-header',
  'cs-protocol',
  'cs-bytes',
  'time-taken',
  'ssl-protocol',
  'ssl-cipher',
  'x-edge-response-result-type',
  'cs-protocol-version',
  'fle-status',
  'fle-encrypted-fields',
  'time-to-first-byte',
  'x-edge-detailed-result-type',
  'sc-content-type',
  'sc-content-len',
  'sc-range-start',
  'sc-range-end',
  'c-country',
  'cache-behavior-path-pattern',
]

export type RequestLogsStackProps = StackProps & {
  // Both from HarpguruSite in London. The distribution's ID is a weak
  // reference, an output there read across regions with Fn::GetStackOutput;
  // the bucket's name is fixed at synthesis, so it arrives as a plain string.
  distribution: IDistribution
  bucket: IBucket
}

// CloudFront's standard logs, delivered to the logs bucket in London. They
// travel through CloudWatch Logs' vended delivery, which is set up as three
// resources: a source, the distribution; a destination, the bucket; and a
// delivery joining them. For CloudFront all three must be made in us-east-1,
// wherever the bucket is, so they get this stack of their own. Nothing is
// written to CloudWatch Logs itself.
//
// Not termination protected: it holds no data, and a deploy rebuilds it.
// Deleting it stops the logs, and the bucket keeps what it has.
export class RequestLogsStack extends Stack {
  constructor(scope: Construct, id: string, props: RequestLogsStackProps) {
    super(scope, id, props)

    const source = new CfnDeliverySource(this, 'Source', {
      name: REQUEST_LOG_SOURCE_NAME,
      resourceArn: props.distribution.distributionArn,
      logType: 'ACCESS_LOGS',
    })

    // JSON, a format Athena reads as it is, and readable by eye. The format
    // can't be changed once made; another means a new destination.
    const destination = new CfnDeliveryDestination(this, 'Destination', {
      name: 'harpguru-request-logs-s3',
      destinationResourceArn: `${props.bucket.bucketArn}/${REQUEST_LOG_PREFIX}`,
      outputFormat: 'json',
    })

    const delivery = new CfnDelivery(this, 'Delivery', {
      deliverySourceName: source.name,
      deliveryDestinationArn: destination.attrArn,
      recordFields: REQUEST_LOG_FIELDS,
      s3SuffixPath: REQUEST_LOG_SUFFIX,
      s3EnableHiveCompatiblePath: true,
    })
    // The source is named by a plain string, so CloudFormation can't see
    // that the delivery needs it.
    delivery.addResourceDependency(source)
  }
}
