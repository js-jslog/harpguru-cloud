import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import {
  CfnConfigurationRecorder,
  CfnDeliveryChannel,
} from 'aws-cdk-lib/aws-config'
import {
  CfnServiceLinkedRole,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam'
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

// The same year the trail's logs are kept. Config keeps its own history of
// each resource too, for seven years by default; the bucket holds the files
// it delivers, which are what can be read without Config.
export const CONFIG_RETENTION_DAYS = 365

export const SERVICE_LINKED_ROLE_NAME = 'AWSServiceRoleForConfig'

// One bucket for both regions' recorders, named from the account so the
// us-east-1 stack can find it without a cross-region reference.
export const configBucketName = (account: string) =>
  `harpguru-config-${account}`

export type ConfigStackProps = StackProps & {
  // The London stack holds the bucket and the service-linked role, and is
  // the one region that records IAM. The us-east-1 stack delivers to that
  // bucket, and depends on that stack.
  primary: boolean
}

// Config in the workload account: a record of what each resource looked like,
// day by day, where CloudTrail records who changed it. Recording is daily
// rather than continuous, because Config charges for each item it records,
// and a daily item is written only if the resource changed that day.
export class ConfigStack extends Stack {
  constructor(scope: Construct, id: string, props: ConfigStackProps) {
    super(scope, id, props)

    const bucketName = configBucketName(this.account)

    // Config's own role, which only Config may change. It can read resources
    // but not write to S3: delivery is made as the config.amazonaws.com
    // service principal, so the bucket policy below is what lets it in.
    let serviceLinkedRole: CfnServiceLinkedRole | undefined
    let bucket: Bucket | undefined
    if (props.primary) {
      serviceLinkedRole = new CfnServiceLinkedRole(this, 'ServiceLinkedRole', {
        awsServiceName: 'config.amazonaws.com',
      })

      // Like the trail's bucket: retained, private, TLS only. Every grant is
      // conditioned on this account, as the Config guide recommends against
      // the confused deputy.
      bucket = new Bucket(this, 'Bucket', {
        bucketName,
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
        lifecycleRules: [{ expiration: Duration.days(CONFIG_RETENTION_DAYS) }],
        removalPolicy: RemovalPolicy.RETAIN,
      })
      const principals = [new ServicePrincipal('config.amazonaws.com')]
      const fromThisAccount = {
        StringEquals: { 'AWS:SourceAccount': this.account },
      }
      bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'AWSConfigBucketPermissionsCheck',
          principals,
          actions: ['s3:GetBucketAcl', 's3:ListBucket'],
          resources: [bucket.bucketArn],
          conditions: fromThisAccount,
        })
      )
      bucket.addToResourcePolicy(
        new PolicyStatement({
          sid: 'AWSConfigBucketDelivery',
          principals,
          actions: ['s3:PutObject'],
          resources: [bucket.arnForObjects(`AWSLogs/${this.account}/Config/*`)],
          conditions: {
            StringEquals: {
              ...fromThisAccount.StringEquals,
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        })
      )
    }

    const recorder = new CfnConfigurationRecorder(this, 'Recorder', {
      name: 'default',
      roleArn: this.formatArn({
        service: 'iam',
        region: '',
        resource: 'role',
        resourceName: `aws-service-role/config.amazonaws.com/${SERVICE_LINKED_ROLE_NAME}`,
      }),
      recordingGroup: {
        allSupported: true,
        // IAM's users, groups, roles and policies are the same in every
        // region, so they are recorded once, here in London. Route 53 zones
        // and CloudFront distributions are recorded only in us-east-1,
        // whatever this says, which is a reason to record there at all.
        includeGlobalResourceTypes: props.primary,
      },
      recordingMode: { recordingFrequency: 'DAILY' },
    })
    // Neither may wait for the other. A channel needs a recorder to exist, and
    // the recorder's create isn't done until it has started recording, which
    // needs the channel. Made to wait for the recorder, the channel was never
    // made: the recorder spent nine minutes failing to start, and the first
    // deploy rolled back (2026-10-30). So, as in AWS's own sample template,
    // both are created side by side.
    const channel = new CfnDeliveryChannel(this, 'DeliveryChannel', {
      name: 'default',
      s3BucketName: bucketName,
    })
    // But both wait for the role, which takes CloudFormation about twenty
    // seconds, so the channel doesn't run ahead of the recorder. And Config
    // checks it may write to the bucket when the channel is made.
    if (serviceLinkedRole) {
      recorder.addResourceDependency(serviceLinkedRole)
      channel.addResourceDependency(serviceLinkedRole)
    }
    if (bucket?.policy) channel.node.addDependency(bucket.policy)
  }
}
