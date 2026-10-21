import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources'
import type { Construct } from 'constructs'
import { EDGE_REGION } from './config'

export type PolicyTypesStackProps = StackProps & {
  organizationRootId: string
}

// Switches SCPs on for the Organization's root. CloudFormation has no
// resource for this, so a custom resource makes the one API call.
//
// Switching them off would detach every SCP in the Organization, so nothing
// here ever does: there is no delete call, the resource is retained, and it
// sits alone in its own termination-protected stack, so that no change to
// the guardrails or the accounts can reach it.
export class PolicyTypesStack extends Stack {
  constructor(scope: Construct, id: string, props: PolicyTypesStackProps) {
    super(scope, id, props)

    const call = {
      service: 'Organizations',
      action: 'enablePolicyType',
      parameters: {
        RootId: props.organizationRootId,
        PolicyType: 'SERVICE_CONTROL_POLICY',
      },
      // Organizations' API is served from us-east-1 whatever region the
      // stack is in.
      region: EDGE_REGION,
      physicalResourceId: PhysicalResourceId.of(
        `${props.organizationRootId}/SERVICE_CONTROL_POLICY`
      ),
      // Already on, for example by hand: nothing to do.
      ignoreErrorCodesMatching: 'PolicyTypeAlreadyEnabledException',
    }

    new AwsCustomResource(this, 'ScpPolicyType', {
      onCreate: call,
      // No onUpdate, so a change to this stack's code never re-runs the call,
      // and no onDelete, so nothing ever switches SCPs off.
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      removalPolicy: RemovalPolicy.RETAIN,
    })
  }
}
