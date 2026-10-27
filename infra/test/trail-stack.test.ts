import { Match, Template } from 'aws-cdk-lib/assertions'
import { LOG_RETENTION_DAYS, TRAIL_NAME, TrailStack } from '../lib/trail-stack'
import { appWithFlags } from './app'

const ORG_ID = 'o-exampleorg1'

const synth = () =>
  Template.fromStack(
    new TrailStack(appWithFlags(), 'Trail', { organizationId: ORG_ID })
  )

test('one trail, for the whole Organization, in every region, with validation', () => {
  const template = synth()
  template.resourceCountIs('AWS::CloudTrail::Trail', 1)
  template.hasResourceProperties('AWS::CloudTrail::Trail', {
    TrailName: TRAIL_NAME,
    IsOrganizationTrail: true,
    IsMultiRegionTrail: true,
    IncludeGlobalServiceEvents: true,
    EnableLogFileValidation: true,
    IsLogging: true,
  })
})

test('only management events: no data events, which are charged per event', () => {
  synth().hasResourceProperties('AWS::CloudTrail::Trail', {
    // Empty is CloudTrail's default: every management event, no data events.
    EventSelectors: [],
    AdvancedEventSelectors: Match.absent(),
  })
})

test('the bucket is private, encrypted, retained, and expires logs after a year', () => {
  synth().hasResource('AWS::S3::Bucket', {
    Properties: {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      LifecycleConfiguration: {
        Rules: [{ ExpirationInDays: LOG_RETENTION_DAYS, Status: 'Enabled' }],
      },
    },
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  })
})

test("member accounts' logs may land under the Organization's prefix", () => {
  synth().hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Allow',
          Action: 's3:PutObject',
          Principal: { Service: 'cloudtrail.amazonaws.com' },
          Resource: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([`/AWSLogs/${ORG_ID}/*`]),
            ]),
          }),
        }),
      ]),
    },
  })
})

test('the stack holds the bucket, its policy and the trail, and nothing else', () => {
  const resources = Object.values(synth().toJSON().Resources) as {
    Type: string
  }[]
  expect(resources.map((r) => r.Type).sort()).toEqual([
    'AWS::CloudTrail::Trail',
    'AWS::S3::Bucket',
    'AWS::S3::BucketPolicy',
  ])
})
