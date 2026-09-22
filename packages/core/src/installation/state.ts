import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterId, ContentKind } from '../config/schema.js'
import { OrdoError } from '../errors/ordo-error.js'
import { assertNoSymlinkTraversal, assertPathInside, normalizeRelativePath } from './ownership.js'

export const INSTALLATION_STATE_VERSION = 1 as const
export const DEFAULT_STATE_PATH = '.ordo/state.json'

export interface InstalledFileRecord {
  readonly adapter: AdapterId
  readonly targetRoot: string
  readonly path: string
  readonly sourceId: string
  readonly kind: ContentKind
  readonly checksum: string
}

export interface InstallationState {
  readonly version: typeof INSTALLATION_STATE_VERSION
  readonly files: readonly InstalledFileRecord[]
}

export const EMPTY_INSTALLATION_STATE: InstallationState = Object.freeze({
  version: INSTALLATION_STATE_VERSION,
  files: Object.freeze([])
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFileRecord(value: unknown, index: number): InstalledFileRecord {
  if (!isRecord(value)) {
    throw new OrdoError('STATE_INVALID', `State file entry ${index} must be an object`)
  }

  const required = ['adapter', 'targetRoot', 'path', 'sourceId', 'kind', 'checksum'] as const
  for (const property of required) {
    if (typeof value[property] !== 'string' || value[property].length === 0) {
      throw new OrdoError('STATE_INVALID', `State file entry ${index}.${property} is invalid`)
    }
  }

  if (value.adapter !== 'claude' && value.adapter !== 'codex') {
    throw new OrdoError('STATE_INVALID', `State file entry ${index}.adapter is invalid`)
  }

  if (!['agents', 'rules', 'skills', 'workflows'].includes(value.kind as string)) {
    throw new OrdoError('STATE_INVALID', `State file entry ${index}.kind is invalid`)
  }

  if (!/^[a-f0-9]{64}$/.test(value.checksum as string)) {
    throw new OrdoError('STATE_INVALID', `State file entry ${index}.checksum is invalid`)
  }

  if (value.targetRoot !== '.') {
    normalizeRelativePath(value.targetRoot as string)
  }

  normalizeRelativePath(value.path as string)
  return Object.freeze(value as unknown as InstalledFileRecord)
}

export function parseInstallationState(value: unknown): InstallationState {
  if (
    !isRecord(value) ||
    value.version !== INSTALLATION_STATE_VERSION ||
    !Array.isArray(value.files)
  ) {
    throw new OrdoError('STATE_INVALID', 'Installation state has an unsupported structure')
  }

  const files = value.files.map(parseFileRecord)
  const keys = files.map(file => `${file.adapter}:${file.targetRoot}:${file.path}`)
  if (new Set(keys).size !== keys.length) {
    throw new OrdoError('STATE_INVALID', 'Installation state contains duplicate file records')
  }

  return Object.freeze({
    version: INSTALLATION_STATE_VERSION,
    files: Object.freeze(
      files.sort((left, right) => fileRecordKey(left).localeCompare(fileRecordKey(right)))
    )
  })
}

export function fileRecordKey(
  record: Pick<InstalledFileRecord, 'adapter' | 'targetRoot' | 'path'>
): string {
  return `${record.adapter}:${record.targetRoot}:${record.path}`
}

export function resolveStatePath(repositoryRoot: string, statePath = DEFAULT_STATE_PATH): string {
  return assertPathInside(repositoryRoot, statePath)
}

export async function loadInstallationState(
  repositoryRoot: string,
  statePath = DEFAULT_STATE_PATH
): Promise<InstallationState> {
  const resolved = resolveStatePath(repositoryRoot, statePath)
  try {
    return parseInstallationState(JSON.parse(await readFile(resolved, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return EMPTY_INSTALLATION_STATE
    }

    if (error instanceof OrdoError) {
      throw error
    }

    throw new OrdoError('STATE_INVALID', `Unable to read installation state: ${resolved}`, {
      cause: error
    })
  }
}

export async function saveInstallationState(
  repositoryRoot: string,
  state: InstallationState,
  statePath = DEFAULT_STATE_PATH
): Promise<void> {
  const resolved = resolveStatePath(repositoryRoot, statePath)
  const validated = parseInstallationState(state)
  const temporary = `${resolved}.${process.pid}.tmp`
  await assertNoSymlinkTraversal(repositoryRoot, resolved)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, resolved)
}
