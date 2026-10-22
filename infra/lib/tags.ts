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

// For a resource being imported: an import adopts the resource exactly as it
// is and can't add tags, so they come off for the import and go back on in
// an ordinary deploy after it.
export const withoutProjectTags = (scope: IConstruct): void => {
  for (const key of Object.keys(PROJECT_TAGS)) {
    Tags.of(scope).remove(key)
  }
}
