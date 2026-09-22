import type { OrdoAdapter } from '@pompeitech/ordo-core'
import { detectCodex } from './detect.js'
import { mapCodexEntries } from './install.js'
import { resolveCodexTarget } from './paths.js'
import { validateCodexTarget } from './validate.js'

export * from './detect.js'
export * from './install.js'
export * from './paths.js'
export * from './validate.js'

export const codexAdapter: OrdoAdapter = Object.freeze({
  id: 'codex',
  displayName: 'Codex',
  supportedContent: Object.freeze(['agents', 'rules', 'skills', 'workflows'] as const),
  detect: detectCodex,
  resolveTarget: resolveCodexTarget,
  mapEntries: mapCodexEntries,
  validate: validateCodexTarget
})
