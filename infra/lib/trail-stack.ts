import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { Trail } from 'aws-cdk-lib/aws-cloudtrail'
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

export const TRAIL_NAME = 'harpguru-org-trail'

// Decided 2026-10-27: a year of history, then gone. CloudTrail's own Event
// history keeps 90 days for free, so this is what the bucket adds.
export const LOG_RETENTION_DAYS = 365

export type TrailStackProps = StackProps & {
  organizationId: string
}

// One trail for the whole Organization, in the management account, where
// SCPs never apply and a member account can't touch it. It records
// management events in every region; the first copy of those is free, so
// the only cost is S3 storage.
//
// Organizations must trust cloudtrail.amazonaws.com before this deploys. The
// console does that itself; CloudFormation doesn't. See the plan's step 4a.
export class TrailStack extends Stack {
  readonly bucket: Bucket

  constructor(scope: Construct, id: string, props: TrailStackProps) {
    super(scope, id, props)

    // Audit logs outlive the stack: deleting it leaves the bucket and its
    // contents behind. Encrypted with S3's own keys; a KMS key would cost
    // $1 a month and protect nothing that matters here.
    this.bucket = new Bucket(this, 'Logs', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      lifecycleRules: [{ expiration: Duration.days(LOG_RETENTION_DAYS) }],
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // The bucket policy CDK writes needs both the trail's name and the
    // Organization's ID, so each member account's logs may land under
    // AWSLogs/<org id>/.
    new Trail(this, 'Trail', {
      trailName: TRAIL_NAME,
      bucket: this.bucket,
      isOrganizationTrail: true,
      orgId: props.organizationId,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      // Digest files, signed hourly, prove whether a log was altered or
      // deleted after delivery.
      enableFileValidation: true,
    })
  }
}
