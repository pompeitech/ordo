import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { RepositoryInfo } from './repository.js'

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'
export type PackageManagerDetectionStatus = 'detected' | 'ambiguous' | 'unknown'

export interface PackageManagerEvidence {
  readonly manager: PackageManagerName
  readonly source: 'manifest' | 'lockfile'
  readonly path: string
}

export interface PackageManagerDetection {
  readonly status: PackageManagerDetectionStatus
  readonly selected: PackageManagerName | null
  readonly version: string | null
  readonly evidence: readonly PackageManagerEvidence[]
  readonly conflicts: readonly PackageManagerName[]
}

const LOCKFILES: Readonly<Record<PackageManagerName, readonly string[]>> = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb']
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

function parsePackageManager(value: string | undefined): {
  manager: PackageManagerName
  version: string | null
} | null {
  if (!value) {
    return null
  }

  const match = /^(npm|pnpm|yarn|bun)@(.+)$/.exec(value)
  if (!match) {
    return null
  }

  return { manager: match[1] as PackageManagerName, version: match[2] ?? null }
}

export async function detectPackageManager(
  repository: RepositoryInfo
): Promise<PackageManagerDetection> {
  const evidence: PackageManagerEvidence[] = []
  const declared = parsePackageManager(repository.manifest?.packageManager)
  if (declared && repository.packageJsonPath) {
    evidence.push({
      manager: declared.manager,
      source: 'manifest',
      path: repository.packageJsonPath
    })
  }

  for (const [manager, lockfiles] of Object.entries(LOCKFILES) as [
    PackageManagerName,
    readonly string[]
  ][]) {
    for (const lockfile of lockfiles) {
      const lockfilePath = path.join(repository.rootDirectory, lockfile)
      if (await isFile(lockfilePath)) {
        evidence.push({ manager, source: 'lockfile', path: lockfilePath })
      }
    }
  }

  if (declared) {
    const conflicts = [...new Set(evidence.map(item => item.manager))].filter(
      manager => manager !== declared.manager
    )
    return Object.freeze({
      status: 'detected',
      selected: declared.manager,
      version: declared.version,
      evidence: Object.freeze(evidence),
      conflicts: Object.freeze(conflicts)
    })
  }

  const candidates = [...new Set(evidence.map(item => item.manager))]
  return Object.freeze({
    status: candidates.length === 1 ? 'detected' : candidates.length > 1 ? 'ambiguous' : 'unknown',
    selected: candidates.length === 1 ? (candidates[0] ?? null) : null,
    version: null,
    evidence: Object.freeze(evidence),
    conflicts: Object.freeze(candidates.length > 1 ? candidates : [])
  })
}
