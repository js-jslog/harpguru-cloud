import { Match, Template } from 'aws-cdk-lib/assertions'
import { PolicyTypesStack } from '../lib/policy-types-stack'
import { appWithFlags } from './app'

const synth = () =>
  Template.fromStack(
    new PolicyTypesStack(appWithFlags(), 'PolicyTypes', {
      organizationRootId: 'r-abcd',
    })
  )

// AwsCustomResource stores each call as a JSON string.
const callsOf = (template: Template) => {
  const [resource] = Object.values(
    template.findResources('Custom::AWS')
  ) as Array<{ Properties: Record<string, unknown> }>
  return resource.Properties
}

test('on create, it switches SCPs on for the given root', () => {
  const create = JSON.parse(callsOf(synth()).Create as string)
  expect(create).toMatchObject({
    service: 'Organizations',
    action: 'enablePolicyType',
    parameters: { RootId: 'r-abcd', PolicyType: 'SERVICE_CONTROL_POLICY' },
    region: 'us-east-1',
    ignoreErrorCodesMatching: 'PolicyTypeAlreadyEnabledException',
  })
})

test('nothing runs on update or delete, so SCPs are never switched off', () => {
  const properties = callsOf(synth())
  expect(properties.Update).toBeUndefined()
  expect(properties.Delete).toBeUndefined()
})

test('the resource is retained if its stack is deleted or it is replaced', () => {
  synth().hasResource('Custom::AWS', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
  })
})

test('its role may call EnablePolicyType and nothing else', () => {
  synth().hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        Match.objectLike({ Action: 'organizations:EnablePolicyType' }),
      ],
    },
  })
})
