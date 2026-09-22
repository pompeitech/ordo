import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterContext, AdapterDetectionResult } from '@pompeitech/ordo-core'
import {
  CLAUDE_AGENT_DIRECTORY,
  CLAUDE_DIRECTORY,
  CLAUDE_INSTRUCTIONS_FILE,
  CLAUDE_RULE_DIRECTORY,
  CLAUDE_SKILL_DIRECTORY
} from './paths.js'

const CLAUDE_MARKERS = [
  CLAUDE_DIRECTORY,
  CLAUDE_AGENT_DIRECTORY,
  CLAUDE_RULE_DIRECTORY,
  CLAUDE_SKILL_DIRECTORY,
  CLAUDE_INSTRUCTIONS_FILE
] as const

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate)

    return true
  } catch {
    return false
  }
}

export async function detectClaude(context: AdapterContext): Promise<AdapterDetectionResult> {
  const evidence = (
    await Promise.all(
      CLAUDE_MARKERS.map(async marker => {
        const candidate = path.join(context.repositoryRoot, marker)

        return (await exists(candidate)) ? candidate : null
      })
    )
  )
    .filter((candidate): candidate is string => candidate !== null)
    .sort((left, right) => left.localeCompare(right))

  return Object.freeze({
    detected: evidence.length > 0,
    evidence: Object.freeze(evidence)
  })
}
