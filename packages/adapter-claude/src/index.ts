import type { OrdoAdapter } from '@pompeitech/ordo-core'
import { detectClaude } from './detect.js'
import { mapClaudeEntries } from './install.js'
import { resolveClaudeTarget } from './paths.js'
import { validateClaudeTarget } from './validate.js'

export * from './detect.js'
export * from './install.js'
export * from './paths.js'
export * from './validate.js'

export const claudeAdapter: OrdoAdapter = Object.freeze({
  id: 'claude',
  displayName: 'Claude Code',
  supportedContent: Object.freeze(['agents', 'rules', 'skills', 'workflows'] as const),
  detect: detectClaude,
  resolveTarget: resolveClaudeTarget,
  mapEntries: mapClaudeEntries,
  validate: validateClaudeTarget
})
