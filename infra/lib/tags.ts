import { Tags } from 'aws-cdk-lib'
import type { IConstruct } from 'constructs'

// Applied once at the app root, so every taggable resource in every stack
// carries them. `project` is the one to activate as a cost allocation tag.
export const PROJECT_TAGS = {
  project: 'harpguru',
  repository: 'harpguru-cloud',
  'managed-by': 'cdk',
} as const

export const applyProjectTags = (scope: IConstruct): void => {
  for (const [key, value] of Object.entries(PROJECT_TAGS)) {
    Tags.of(scope).add(key, value)
  }
}
