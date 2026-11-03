import { Stack, type StackProps } from 'aws-cdk-lib'
import { CfnDetector } from 'aws-cdk-lib/aws-guardduty'
import type { Construct } from 'constructs'

// GuardDuty in one account and one region: a detector, which reads that
// region's CloudTrail management events, DNS queries and VPC flow logs
// straight from AWS's side, without either being switched on here, and
// raises findings about what looks like an attack. Four of these, one per
// account per region, decided 2026-10-27: standalone, because a delegated
// administrator only earns its keep with more accounts than two.
//
// The optional protection plans are left to GuardDuty's defaults, so they
// aren't in the template or the diff; the plan's step 4c records which were
// on after the deploy. GuardDuty creates its own service-linked role,
// AWSServiceRoleForAmazonGuardDuty, with the first detector in an account.
export class GuardDutyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    // There can be only one detector per account per region. Deleting it
    // deletes its findings, which is why each stack is protected.
    new CfnDetector(this, 'Detector', { enable: true })
  }
}
