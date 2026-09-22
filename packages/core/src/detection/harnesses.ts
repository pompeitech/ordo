import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterId } from '../config/schema.js'
import type { RepositoryInfo } from './repository.js'

export interface HarnessDetection {
  readonly adapter: AdapterId
  readonly detected: boolean
  readonly evidence: readonly string[]
}

const HARNESS_MARKERS: Readonly<Record<AdapterId, readonly string[]>> = {
  claude: ['.claude', 'CLAUDE.md'],
  codex: ['.codex', 'AGENTS.md']
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

export async function detectHarnesses(
  repository: RepositoryInfo
): Promise<readonly HarnessDetection[]> {
  const detections: HarnessDetection[] = []
  for (const [adapter, markers] of Object.entries(HARNESS_MARKERS) as [
    AdapterId,
    readonly string[]
  ][]) {
    const evidence: string[] = []
    for (const marker of markers) {
      const candidate = path.join(repository.rootDirectory, marker)
      if (await exists(candidate)) {
        evidence.push(candidate)
      }
    }

    detections.push({ adapter, detected: evidence.length > 0, evidence: Object.freeze(evidence) })
  }

  return Object.freeze(detections)
}
