import { Stack, type StackProps } from 'aws-cdk-lib'
import { CfnOrganizationalUnit, CfnPolicy } from 'aws-cdk-lib/aws-organizations'
import type { Construct } from 'constructs'
import { EDGE_REGION, PRIMARY_REGION } from './config'

export const ALLOWED_REGIONS = [PRIMARY_REGION, EDGE_REGION]

// Each SCP is a plain policy document, so what is written here is exactly
// what Organizations stores. SCPs only ever limit: an action needs an IAM
// allow and no SCP deny.
export const SCPS = {
  'harpguru-region-lock': {
    description: `Deny actions outside ${ALLOWED_REGIONS.join(' and ')}`,
    content: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyOutsideAllowedRegions',
          Effect: 'Deny',
          // Global services, exempted as in AWS's own example. Their APIs
          // live in us-east-1, which is allowed anyway, so this list is a
          // safety margin rather than load-bearing.
          NotAction: [
            'cloudfront:*',
            'iam:*',
            'organizations:*',
            'route53:*',
            'support:*',
          ],
          Resource: '*',
          Condition: {
            StringNotEquals: { 'aws:RequestedRegion': ALLOWED_REGIONS },
          },
        },
      ],
    },
  },
  'harpguru-deny-root': {
    description: "Deny every action by a member account's root user",
    content: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyRootUser',
          Effect: 'Deny',
          Action: '*',
          Resource: '*',
          Condition: {
            ArnLike: { 'aws:PrincipalArn': 'arn:aws:iam::*:root' },
          },
        },
      ],
    },
  },
  'harpguru-deny-leave-org': {
    description: 'Deny leaving the Organization',
    content: {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyLeaveOrganization',
          Effect: 'Deny',
          Action: 'organizations:LeaveOrganization',
          Resource: '*',
        },
      ],
    },
  },
} as const

export type GuardrailsStackProps = StackProps & {
  organizationRootId: string
}

// The Workloads OU and the SCPs on it. Deployed before any account is put
// in the OU, so an account is governed from the moment it exists.
export class GuardrailsStack extends Stack {
  readonly workloadsOu: CfnOrganizationalUnit

  constructor(scope: Construct, id: string, props: GuardrailsStackProps) {
    super(scope, id, props)

    this.workloadsOu = new CfnOrganizationalUnit(this, 'Workloads', {
      name: 'Workloads',
      parentId: props.organizationRootId,
    })

    for (const [name, { description, content }] of Object.entries(SCPS)) {
      new CfnPolicy(this, name, {
        name,
        description,
        type: 'SERVICE_CONTROL_POLICY',
        content,
        targetIds: [this.workloadsOu.attrId],
      })
    }
  }
}
