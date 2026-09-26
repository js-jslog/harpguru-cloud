import { App, Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { Topic } from 'aws-cdk-lib/aws-sns'
import { applyProjectTags, PROJECT_TAGS } from '../lib/tags'

test('every taggable resource in the app carries the project tags', () => {
  const app = new App()
  applyProjectTags(app)
  // Any taggable resource will do; nothing here is deployed.
  const stack = new Stack(app, 'TagProbe')
  new Topic(stack, 'Probe')

  const tags = Template.fromStack(stack).findResources('AWS::SNS::Topic')
  const [topic] = Object.values(tags)

  expect(topic.Properties.Tags).toEqual(
    expect.arrayContaining(
      Object.entries(PROJECT_TAGS).map(([Key, Value]) => ({ Key, Value }))
    )
  )
})
