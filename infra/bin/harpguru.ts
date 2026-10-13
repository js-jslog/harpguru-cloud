#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { applyProjectTags } from '../lib/tags'

const app = new App()
applyProjectTags(app)

// Stacks are added here as Phase A lands them; see docs/plans/phase-a.md.
