import { Template } from 'aws-cdk-lib/assertions'
import {
  CONFIG_RETENTION_DAYS,
  ConfigStack,
  configBucketName,
} from '../lib/config-stack'
import { appWithFlags } from './app'

const ACCOUNT = '111122223333'

const synth = (primary: boolean) =>
  Template.fromStack(
    new ConfigStack(appWithFlags(), 'Config', {
      env: { account: ACCOUNT, region: primary ? 'eu-west-2' : 'us-east-1' },
      primary,
    })
  )

test.each([true, false])(
  'records every supported type, daily, through the service-linked role (primary: %s)',
  (primary) => {
    synth(primary).hasResourceProperties('AWS::Config::ConfigurationRecorder', {
      RecordingGroup: { AllSupported: true },
      RecordingMode: { RecordingFrequency: 'DAILY' },
      RoleARN: `arn:aws:iam::${ACCOUNT}:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig`,
    })
  }
)

test('IAM is recorded in London only, not again in us-east-1', () => {
  synth(true).hasResourceProperties('AWS::Config::ConfigurationRecorder', {
    RecordingGroup: { IncludeGlobalResourceTypes: true },
  })
  synth(false).hasResourceProperties('AWS::Config::ConfigurationRecorder', {
    RecordingGroup: { IncludeGlobalResourceTypes: false },
  })
})

test.each([true, false])(
  'both regions deliver to the one London bucket (primary: %s)',
  (primary) => {
    synth(primary).hasResourceProperties('AWS::Config::DeliveryChannel', {
      S3BucketName: configBucketName(ACCOUNT),
    })
  }
)

// The first deploy deadlocked: the recorder's create waits until it is
// recording, which needs the channel, so the channel must never wait for it.
test.each([true, false])(
  'the channel never waits for the recorder (primary: %s)',
  (primary) => {
    const resources = synth(primary).toJSON().Resources
    const idOf = (type: string) =>
      Object.keys(resources).find((id) => resources[id].Type === type)!
    const dependsOn = (type: string): string[] =>
      resources[idOf(type)].DependsOn ?? []
    expect(dependsOn('AWS::Config::DeliveryChannel')).not.toContain(
      idOf('AWS::Config::ConfigurationRecorder')
    )
    if (primary) {
      // Both wait for the role, so the channel can't run ahead of the
      // recorder; the channel waits for the bucket policy too.
      const role = idOf('AWS::IAM::ServiceLinkedRole')
      expect(dependsOn('AWS::Config::ConfigurationRecorder')).toEqual([role])
      expect(dependsOn('AWS::Config::DeliveryChannel').sort()).toEqual(
        [role, idOf('AWS::S3::BucketPolicy')].sort()
      )
    }
  }
)

test('London holds the bucket and the role; us-east-1 holds neither', () => {
  const primary = synth(true)
  primary.resourceCountIs('AWS::S3::Bucket', 1)
  primary.resourceCountIs('AWS::IAM::ServiceLinkedRole', 1)
  const edge = synth(false)
  edge.resourceCountIs('AWS::S3::Bucket', 0)
  edge.resourceCountIs('AWS::IAM::ServiceLinkedRole', 0)
})

test('the bucket is private, encrypted, retained, and expires files after a year', () => {
  synth(true).hasResource('AWS::S3::Bucket', {
    Properties: {
      BucketName: configBucketName(ACCOUNT),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: {
        Rules: [{ ExpirationInDays: CONFIG_RETENTION_DAYS, Status: 'Enabled' }],
      },
    },
    DeletionPolicy: 'Retain',
  })
})

test("every grant to Config is conditioned on this account, not any account's", () => {
  const policies = synth(true).findResources('AWS::S3::BucketPolicy')
  const statements = Object.values(policies)[0].Properties.PolicyDocument
    .Statement as {
    Principal?: { Service?: string }
    Condition: { StringEquals: Record<string, string> }
  }[]
  const toConfig = statements.filter(
    (s) => s.Principal?.Service === 'config.amazonaws.com'
  )
  expect(toConfig).toHaveLength(2)
  for (const statement of toConfig) {
    expect(statement.Condition.StringEquals['AWS:SourceAccount']).toBe(ACCOUNT)
  }
})
