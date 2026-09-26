import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'

/**
 * Snapshots of the working tree taken around an agent task, so a person can see
 * exactly what the agent changed and undo it file by file. A snapshot is a Git tree
 * object built from a temporary index: no commit, no change to the user's index,
 * untracked files included, ignored files and `.ordo/` excluded. A local ref under
 * `refs/ordo/snapshots/` keeps it from being garbage-collected; it is never pushed
 * unless someone pushes that namespace on purpose.
 */

export interface WorkspaceSnapshot {
  readonly tree: string
  readonly ref: string
  readonly takenAt: string
}

export type FileChangeKind = 'added' | 'modified' | 'deleted'

export interface FileChange {
  readonly path: string
  readonly change: FileChangeKind
  /** Undefined for binary files. */
  readonly additions?: number
  readonly deletions?: number
}

export interface RejectResult {
  readonly restored: readonly string[]
  /** Files edited after the agent finished: left untouched to protect that work. */
  readonly conflicts: readonly string[]
}

interface GitResult {
  readonly stdout: string
}

function git(
  repositoryRoot: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  encoding: BufferEncoding = 'utf8'
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      {
        cwd: repositoryRoot,
        env: { ...process.env, ...env },
        encoding,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60_000
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new OrdoError(
              'WORKSPACE_SNAPSHOT_FAILED',
              `git ${args[0]} failed: ${String(stderr).trim() || error.message}`,
              {
                cause: error
              }
            )
          )
          return
        }
        resolve({ stdout: String(stdout) })
      }
    )
  })
}

const EXCLUDE_ORDO = ':(exclude).ordo'
const REF_PATTERN = /^[a-z0-9-]+$/

/** Whether the repository can take snapshots (Git installed, inside a work tree). */
export async function canSnapshotWorkspace(repositoryRoot: string): Promise<boolean> {
  try {
    const { stdout } = await git(repositoryRoot, ['rev-parse', '--is-inside-work-tree'])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Records the working tree as a Git tree and pins it with `refs/ordo/snapshots/<name>`.
 * The user's own index is only read, to reuse its file stat cache.
 */
export async function snapshotWorkspace(
  repositoryRoot: string,
  name: string
): Promise<WorkspaceSnapshot> {
  if (!REF_PATTERN.test(name)) {
    throw new OrdoError('WORKSPACE_SNAPSHOT_FAILED', `Invalid snapshot name: ${name}`)
  }
  const directory = path.join(tmpdir(), `ordo-snapshot-${randomUUID()}`)
  const index = path.join(directory, 'index')
  await mkdir(directory, { recursive: true })
  try {
    const { stdout: realIndex } = await git(repositoryRoot, ['rev-parse', '--git-path', 'index'])
    await copyFile(path.resolve(repositoryRoot, realIndex.trim()), index).catch(() => undefined)
    const env = { GIT_INDEX_FILE: index }
    await git(repositoryRoot, ['add', '-A', '--', '.', EXCLUDE_ORDO], env)
    // Tracked files under .ordo/ may still sit in the copied index; drop them.
    await git(
      repositoryRoot,
      ['rm', '-r', '--cached', '--quiet', '--ignore-unmatch', '--', '.ordo'],
      env
    )
    const { stdout: tree } = await git(repositoryRoot, ['write-tree'], env)
    const ref = `refs/ordo/snapshots/${name}`
    // A ref may point straight at a tree; that keeps the snapshot reachable for gc.
    await git(repositoryRoot, ['update-ref', ref, tree.trim()])
    return Object.freeze({ tree: tree.trim(), ref, takenAt: new Date().toISOString() })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** Files that differ between two snapshots, with line counts when they are text. */
export async function diffSnapshots(
  repositoryRoot: string,
  before: string,
  after: string
): Promise<readonly FileChange[]> {
  const [{ stdout: status }, { stdout: numstat }] = await Promise.all([
    git(repositoryRoot, ['diff', '--no-renames', '--name-status', '-z', before, after]),
    git(repositoryRoot, ['diff', '--no-renames', '--numstat', '-z', before, after])
  ])
  const counts = new Map<string, { additions?: number; deletions?: number }>()
  for (const record of numstat.split('\0').filter(Boolean)) {
    const [additions, deletions, file] = record.split('\t')
    if (file) {
      counts.set(file, {
        additions: additions === '-' ? undefined : Number(additions),
        deletions: deletions === '-' ? undefined : Number(deletions)
      })
    }
  }
  const parts = status.split('\0').filter(Boolean)
  const changes: FileChange[] = []
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const code = parts[index]
    const file = parts[index + 1] as string
    const change: FileChangeKind = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified'
    changes.push(Object.freeze({ path: file, change, ...counts.get(file) }))
  }
  return Object.freeze(changes.sort((left, right) => left.path.localeCompare(right.path)))
}

/** Unified diff between two snapshots, optionally limited to some files. */
export async function snapshotDiffText(
  repositoryRoot: string,
  before: string,
  after: string,
  files: readonly string[] = []
): Promise<string> {
  const { stdout } = await git(repositoryRoot, [
    'diff',
    '--no-renames',
    '--no-color',
    before,
    after,
    '--',
    ...files
  ])
  return stdout
}

/** Content of a file inside a snapshot, or undefined if the file is not in it. */
export async function readSnapshotFile(
  repositoryRoot: string,
  tree: string,
  file: string
): Promise<Buffer | undefined> {
  try {
    const { stdout } = await git(
      repositoryRoot,
      ['cat-file', 'blob', `${tree}:${file}`],
      {},
      'latin1'
    )
    return Buffer.from(stdout, 'latin1')
  } catch {
    return undefined
  }
}

async function blobId(
  repositoryRoot: string,
  tree: string,
  file: string
): Promise<string | undefined> {
  try {
    return (await git(repositoryRoot, ['rev-parse', `${tree}:${file}`])).stdout.trim()
  } catch {
    return undefined
  }
}

async function workingFileId(repositoryRoot: string, file: string): Promise<string | undefined> {
  try {
    return (await git(repositoryRoot, ['hash-object', '--', file])).stdout.trim()
  } catch {
    return undefined
  }
}

function insideRepository(repositoryRoot: string, file: string): string {
  const absolute = path.resolve(repositoryRoot, file)
  const relative = path.relative(repositoryRoot, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new OrdoError('PATH_UNSAFE', `Path is outside the repository: ${file}`)
  }
  return absolute
}

/**
 * Puts the given files back as they were before the agent task. All or nothing: if
 * any of them was edited after the agent finished, nothing is restored and those
 * files are reported as conflicts, so no one's later work is overwritten.
 */
export async function rejectSnapshotChanges(
  repositoryRoot: string,
  before: string,
  after: string,
  files: readonly string[]
): Promise<RejectResult> {
  const changed = new Map(
    (await diffSnapshots(repositoryRoot, before, after)).map(item => [item.path, item])
  )
  const requested = [...new Set(files)]
  const conflicts: string[] = []
  for (const file of requested) {
    if (!changed.has(file)) {
      throw new OrdoError('PATH_UNSAFE', `The agent did not change this file: ${file}`)
    }
    insideRepository(repositoryRoot, file)
    const expected = await blobId(repositoryRoot, after, file)
    const current = await workingFileId(repositoryRoot, file)
    if (expected !== current) {
      conflicts.push(file)
    }
  }
  if (conflicts.length > 0) {
    return Object.freeze({ restored: Object.freeze([]), conflicts: Object.freeze(conflicts) })
  }
  const restored: string[] = []
  for (const file of requested) {
    const change = changed.get(file) as FileChange
    const absolute = insideRepository(repositoryRoot, file)
    if (change.change === 'added') {
      await unlink(absolute)
    } else {
      const content = await readSnapshotFile(repositoryRoot, before, file)
      if (!content) {
        throw new OrdoError('WORKSPACE_SNAPSHOT_FAILED', `Missing original content for ${file}`)
      }
      await mkdir(path.dirname(absolute), { recursive: true })
      await writeFile(absolute, content)
    }
    restored.push(file)
  }
  return Object.freeze({ restored: Object.freeze(restored), conflicts: Object.freeze(conflicts) })
}
