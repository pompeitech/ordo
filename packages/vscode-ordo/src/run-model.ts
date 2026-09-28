import type { PromptEstimate } from '@pompeitech/ordo-runtime'
import type { ConnectionView } from './connections.js'
import type { RunHarnessOption } from './types.js'

/**
 * Every harness, so the page can show why one cannot run: only connected ones
 * (installed and signed in) are selectable.
 */
export function runHarnesses(connections: readonly ConnectionView[]): readonly RunHarnessOption[] {
  return connections.map(connection => ({
    id: connection.id,
    name: connection.name,
    connected: connection.status === 'connected',
    detail:
      connection.status === 'connected'
        ? [connection.version, connection.auth].filter(Boolean).join(' · ')
        : connection.message
  }))
}

function thousands(value: number): string {
  return value.toLocaleString('en-US')
}

/** "~3,200 tokens (Specification and plan step ~900 · Project context ~1,500 · …)" */
export function describeEstimate(estimate: PromptEstimate): string {
  const parts = estimate.parts
    .map(part => `${part.name} ~${thousands(part.estimatedTokens)}`)
    .join(' · ')
  return `~${thousands(estimate.estimatedTokens)} tokens${parts ? ` (${parts})` : ''}`
}
