import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'
import { assertNoSymlinkTraversal } from './ownership.js'
import type { InstallationAction, InstallationPlan } from './planner.js'
import { DEFAULT_STATE_PATH, saveInstallationState } from './state.js'

export interface InstallOptions {
  readonly dryRun?: boolean
  readonly statePath?: string
}

export interface InstallationResult {
  readonly created: number
  readonly updated: number
  readonly removed: number
  readonly skipped: number
  readonly dryRun: boolean
}

interface Snapshot {
  readonly path: string
  readonly content: Buffer | null
  readonly mode: number | null
}

let temporarySequence = 0

async function snapshot(filePath: string): Promise<Snapshot> {
  try {
    const fileStat = await stat(filePath)
    return { path: filePath, content: await readFile(filePath), mode: fileStat.mode }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path: filePath, content: null, mode: null }
    }

    throw error
  }
}

async function writeAtomic(
  filePath: string,
  content: string | Buffer,
  mode?: number
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  temporarySequence += 1
  const temporary = `${filePath}.${process.pid}.${temporarySequence}.tmp`
  await writeFile(temporary, content, mode === undefined ? undefined : { mode })
  await rename(temporary, filePath)
}

async function applyAction(action: InstallationAction): Promise<void> {
  if (action.type === 'skip') {
    return
  }

  if (action.type === 'remove') {
    await unlink(action.destinationPath)
    return
  }

  if (action.content === undefined) {
    throw new OrdoError('INSTALLATION_FAILED', `Missing content for: ${action.destinationPath}`)
  }

  await writeAtomic(action.destinationPath, action.content)
}

async function restore(snapshots: readonly Snapshot[]): Promise<void> {
  for (const item of [...snapshots].reverse()) {
    if (item.content === null) {
      try {
        await unlink(item.path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    } else {
      await writeAtomic(item.path, item.content, item.mode ?? undefined)
      if (item.mode !== null) {
        await chmod(item.path, item.mode)
      }
    }
  }
}

export async function install(
  plan: InstallationPlan,
  options: InstallOptions = {}
): Promise<InstallationResult> {
  if (plan.conflicts.length > 0) {
    throw new OrdoError('INSTALLATION_CONFLICT', 'Installation plan contains conflicts', {
      details: { conflicts: plan.conflicts }
    })
  }

  const result: InstallationResult = {
    created: plan.actions.filter(action => action.type === 'create').length,
    updated: plan.actions.filter(action => action.type === 'update').length,
    removed: plan.actions.filter(action => action.type === 'remove').length,
    skipped: plan.actions.filter(action => action.type === 'skip').length,
    dryRun: options.dryRun ?? false
  }
  if (options.dryRun) {
    return Object.freeze(result)
  }

  const mutableActions = plan.actions.filter(action => action.type !== 'skip')
  const snapshots: Snapshot[] = []
  try {
    for (const action of mutableActions) {
      await assertNoSymlinkTraversal(plan.repositoryRoot, action.destinationPath)
      snapshots.push(await snapshot(action.destinationPath))
      await applyAction(action)
    }

    await saveInstallationState(
      plan.repositoryRoot,
      plan.nextState,
      options.statePath ?? DEFAULT_STATE_PATH
    )
    return Object.freeze(result)
  } catch (error) {
    try {
      await restore(snapshots)
    } catch (rollbackError) {
      throw new OrdoError('INSTALLATION_FAILED', 'Installation and rollback failed', {
        cause: error,
        details: { rollbackError }
      })
    }

    throw new OrdoError('INSTALLATION_FAILED', 'Installation failed and was rolled back', {
      cause: error
    })
  }
}
