import path from 'node:path'
import type { AdapterOutputFile, AdapterTarget } from '../adapters/types.js'
import type { ConflictStrategy } from '../config/schema.js'
import { OrdoError } from '../errors/ordo-error.js'
import {
  assertNoSymlinkTraversal,
  assertPathInside,
  checksum,
  checksumFile,
  normalizeRelativePath,
  relativePathInside
} from './ownership.js'
import {
  fileRecordKey,
  INSTALLATION_STATE_VERSION,
  type InstallationState,
  type InstalledFileRecord
} from './state.js'

export type InstallationActionType = 'create' | 'update' | 'remove' | 'skip'

export interface InstallationTargetInput {
  readonly target: AdapterTarget
  readonly files: readonly AdapterOutputFile[]
}

export interface InstallationAction {
  readonly type: InstallationActionType
  readonly reason: string
  readonly destinationPath: string
  readonly record: InstalledFileRecord
  readonly content?: string
}

export interface InstallationConflict {
  readonly code: string
  readonly message: string
  readonly destinationPath: string
}

export interface InstallationPlan {
  readonly repositoryRoot: string
  readonly actions: readonly InstallationAction[]
  readonly conflicts: readonly InstallationConflict[]
  readonly nextState: InstallationState
}

export interface PlanInstallationOptions {
  readonly repositoryRoot: string
  readonly targets: readonly InstallationTargetInput[]
  readonly previousState: InstallationState
  readonly conflictStrategy: ConflictStrategy
  readonly prune: boolean
}

interface Candidate {
  readonly destinationPath: string
  readonly content: string
  readonly record: InstalledFileRecord
}

function createCandidate(
  repositoryRoot: string,
  input: InstallationTargetInput,
  file: AdapterOutputFile
): Candidate {
  const absoluteTargetRoot = path.resolve(repositoryRoot, input.target.rootDirectory)
  const targetRoot = relativePathInside(repositoryRoot, absoluteTargetRoot)
  const relativePath = normalizeRelativePath(file.relativePath)
  const targetDirectory = assertPathInside(repositoryRoot, targetRoot)
  const destinationPath = assertPathInside(targetDirectory, relativePath)
  return {
    destinationPath,
    content: file.content,
    record: Object.freeze({
      adapter: input.target.adapter,
      targetRoot,
      path: relativePath,
      sourceId: file.sourceId,
      kind: file.kind,
      checksum: checksum(file.content)
    })
  }
}

function conflict(code: string, message: string, destinationPath: string): InstallationConflict {
  return { code, message, destinationPath }
}

export async function planInstallation(
  options: PlanInstallationOptions
): Promise<InstallationPlan> {
  const repositoryRoot = path.resolve(options.repositoryRoot)
  const actions: InstallationAction[] = []
  const conflicts: InstallationConflict[] = []
  const previousRecords = new Map(
    options.previousState.files.map(record => [fileRecordKey(record), record])
  )
  const nextRecords = new Map(previousRecords)
  const candidates = options.targets.flatMap(input =>
    input.files.map(file => createCandidate(repositoryRoot, input, file))
  )
  const destinationCounts = new Map<string, number>()
  for (const candidate of candidates) {
    destinationCounts.set(
      candidate.destinationPath,
      (destinationCounts.get(candidate.destinationPath) ?? 0) + 1
    )
  }

  for (const candidate of candidates.sort((a, b) =>
    a.destinationPath.localeCompare(b.destinationPath)
  )) {
    if ((destinationCounts.get(candidate.destinationPath) ?? 0) > 1) {
      if (!conflicts.some(item => item.destinationPath === candidate.destinationPath)) {
        conflicts.push(
          conflict(
            'duplicate-destination',
            'Multiple entries map to the same file',
            candidate.destinationPath
          )
        )
      }

      continue
    }

    await assertNoSymlinkTraversal(repositoryRoot, candidate.destinationPath)
    const key = fileRecordKey(candidate.record)
    const previous = previousRecords.get(key)
    let currentChecksum: string | null
    try {
      currentChecksum = await checksumFile(candidate.destinationPath)
    } catch {
      conflicts.push(
        conflict(
          'invalid-destination',
          'Destination is not a readable file',
          candidate.destinationPath
        )
      )
      continue
    }

    if (!previous && currentChecksum !== null) {
      if (options.conflictStrategy === 'error') {
        conflicts.push(
          conflict(
            'unmanaged-file',
            'Destination exists and is not owned by Ordo',
            candidate.destinationPath
          )
        )
        continue
      }

      if (options.conflictStrategy === 'skip') {
        actions.push({
          type: 'skip',
          reason: 'unmanaged-file',
          destinationPath: candidate.destinationPath,
          record: candidate.record
        })
        continue
      }
    }

    if (previous && currentChecksum !== null && currentChecksum !== previous.checksum) {
      if (options.conflictStrategy === 'error') {
        conflicts.push(
          conflict(
            'modified-owned-file',
            'Owned file was modified after installation',
            candidate.destinationPath
          )
        )
        continue
      }

      if (options.conflictStrategy === 'skip') {
        actions.push({
          type: 'skip',
          reason: 'modified-owned-file',
          destinationPath: candidate.destinationPath,
          record: previous
        })
        continue
      }
    }

    nextRecords.set(key, candidate.record)
    if (currentChecksum === null) {
      actions.push({
        type: 'create',
        reason: previous ? 'owned-file-missing' : 'destination-missing',
        destinationPath: candidate.destinationPath,
        record: candidate.record,
        content: candidate.content
      })
    } else if (currentChecksum === candidate.record.checksum) {
      actions.push({
        type: 'skip',
        reason: previous ? 'unchanged' : 'adopted-identical-file',
        destinationPath: candidate.destinationPath,
        record: candidate.record
      })
    } else {
      actions.push({
        type: 'update',
        reason: previous ? 'source-changed' : 'overwrite-enabled',
        destinationPath: candidate.destinationPath,
        record: candidate.record,
        content: candidate.content
      })
    }
  }

  const candidateKeys = new Set(candidates.map(candidate => fileRecordKey(candidate.record)))
  for (const previous of options.previousState.files) {
    const key = fileRecordKey(previous)
    if (candidateKeys.has(key) || !options.prune) {
      continue
    }

    const targetDirectory = assertPathInside(repositoryRoot, previous.targetRoot)
    const destinationPath = assertPathInside(targetDirectory, previous.path)
    await assertNoSymlinkTraversal(repositoryRoot, destinationPath)
    let currentChecksum: string | null
    try {
      currentChecksum = await checksumFile(destinationPath)
    } catch {
      conflicts.push(
        conflict('invalid-destination', 'Stale destination is not a readable file', destinationPath)
      )
      continue
    }

    if (currentChecksum === null) {
      nextRecords.delete(key)
      continue
    }

    if (currentChecksum !== previous.checksum) {
      conflicts.push(
        conflict('modified-stale-file', 'Stale owned file was modified', destinationPath)
      )
      continue
    }

    nextRecords.delete(key)
    actions.push({
      type: 'remove',
      reason: 'stale-owned-file',
      destinationPath,
      record: previous
    })
  }

  if (options.previousState.version !== INSTALLATION_STATE_VERSION) {
    throw new OrdoError('STATE_INVALID', 'Unsupported installation state version')
  }

  const nextState: InstallationState = Object.freeze({
    version: INSTALLATION_STATE_VERSION,
    files: Object.freeze(
      [...nextRecords.values()].sort((a, b) => fileRecordKey(a).localeCompare(fileRecordKey(b)))
    )
  })
  return Object.freeze({
    repositoryRoot,
    actions: Object.freeze(actions),
    conflicts: Object.freeze(conflicts),
    nextState
  })
}
