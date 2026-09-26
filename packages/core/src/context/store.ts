import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'
import type {
  ContextBlock,
  ContextEntry,
  ContextEntryReport,
  ContextEntryVisibility,
  ContextManifest,
  ContextPreviewReport,
  ContextReport,
  ContextSnapshot,
  ContextSnapshotBlock,
  ContextSnapshotReport
} from './types.js'

const CONTEXT_SCHEMA_VERSION = 1 as const
const EMPTY_MANIFEST: ContextManifest = Object.freeze({ schemaVersion: 1, entries: [] })

function contextPaths(repositoryRoot: string) {
  const ordoDirectory = path.join(repositoryRoot, '.ordo')
  const contextDirectory = path.join(ordoDirectory, 'context')

  return {
    contextDirectory,
    snapshotsDirectory: path.join(contextDirectory, 'snapshots'),
    manifestPath: path.join(contextDirectory, 'index.json'),
    brainPath: path.join(ordoDirectory, 'brain.md')
  }
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

function estimateTokens(content: string): number {
  return content.length === 0 ? 0 : Math.ceil(content.length / 4)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/')
  return (
    normalized.length > 0 &&
    !path.posix.isAbsolute(normalized) &&
    !normalized.split('/').some(segment => segment === '..' || segment === '')
  )
}

function assertManifest(value: unknown, manifestPath: string): ContextManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('CONTEXT_INVALID', `Context manifest must be an object: ${manifestPath}`)
  }

  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CONTEXT_SCHEMA_VERSION || !Array.isArray(record.entries)) {
    throw new OrdoError('CONTEXT_INVALID', `Unsupported context manifest: ${manifestPath}`)
  }

  const entries = record.entries.map((candidate, index): ContextEntry => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new OrdoError('CONTEXT_INVALID', `Invalid context entry at index ${index}`)
    }

    const entry = candidate as Record<string, unknown>
    if (
      typeof entry.id !== 'string' ||
      typeof entry.path !== 'string' ||
      !isSafeRelativePath(entry.path) ||
      (entry.visibility !== 'visible' && entry.visibility !== 'hidden') ||
      typeof entry.addedAt !== 'string'
    ) {
      throw new OrdoError('CONTEXT_INVALID', `Invalid context entry at index ${index}`)
    }

    return Object.freeze({
      id: entry.id,
      path: entry.path,
      visibility: entry.visibility,
      addedAt: entry.addedAt
    })
  })

  return Object.freeze({ schemaVersion: CONTEXT_SCHEMA_VERSION, entries: Object.freeze(entries) })
}

async function loadManifest(repositoryRoot: string): Promise<ContextManifest> {
  const { manifestPath } = contextPaths(repositoryRoot)
  if (!(await fileExists(manifestPath))) {
    return EMPTY_MANIFEST
  }

  try {
    return assertManifest(JSON.parse(await readFile(manifestPath, 'utf8')), manifestPath)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('CONTEXT_INVALID', `Unable to read context manifest: ${manifestPath}`, {
      cause: error
    })
  }
}

async function saveManifest(repositoryRoot: string, manifest: ContextManifest): Promise<void> {
  const { contextDirectory, manifestPath } = contextPaths(repositoryRoot)
  await mkdir(contextDirectory, { recursive: true })
  const temporaryPath = path.join(contextDirectory, `.index-${randomUUID()}.tmp`)
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  await rename(temporaryPath, manifestPath)
}

async function resolveProjectFile(repositoryRoot: string, value: string): Promise<string> {
  const absolute = path.resolve(repositoryRoot, value)
  const relative = path.relative(repositoryRoot, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new OrdoError('PATH_UNSAFE', `Context path must be inside the repository: ${value}`)
  }

  let resolved: string
  try {
    const details = await stat(absolute)
    if (!details.isFile()) {
      throw new OrdoError('CONTEXT_INVALID', `Context path must be a file: ${value}`)
    }
    resolved = await realpath(absolute)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('CONTEXT_NOT_FOUND', `Context file not found: ${value}`, { cause: error })
  }

  const realRoot = await realpath(repositoryRoot)
  const realRelative = path.relative(realRoot, resolved)
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new OrdoError('PATH_UNSAFE', `Context path resolves outside the repository: ${value}`)
  }

  return realRelative.split(path.sep).join('/')
}

function entryId(relativePath: string): string {
  const slug = relativePath
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replaceAll('/', ':')
    .toLowerCase()
  const digest = createHash('sha256').update(relativePath).digest('hex').slice(0, 8)
  return `${slug}-${digest}`
}

async function readEntryReport(
  repositoryRoot: string,
  entry: ContextEntry
): Promise<ContextEntryReport> {
  try {
    const safePath = await resolveProjectFile(repositoryRoot, entry.path)
    const content = await readFile(path.join(repositoryRoot, safePath), 'utf8')
    return Object.freeze({
      ...entry,
      exists: true,
      bytes: Buffer.byteLength(content),
      estimatedTokens: estimateTokens(content)
    })
  } catch (error) {
    if (error instanceof OrdoError && error.code !== 'CONTEXT_NOT_FOUND') {
      throw error
    }
    return Object.freeze({ ...entry, exists: false, bytes: 0, estimatedTokens: 0 })
  }
}

export async function initializeProjectContext(repositoryRoot: string): Promise<ContextReport> {
  const paths = contextPaths(repositoryRoot)
  await mkdir(paths.contextDirectory, { recursive: true })
  if (!(await fileExists(paths.manifestPath))) {
    await saveManifest(repositoryRoot, EMPTY_MANIFEST)
  }
  if (!(await fileExists(paths.brainPath))) {
    await writeFile(
      paths.brainPath,
      '# Project memory\n\nRecord durable domain knowledge, invariants, vocabulary, and architectural decisions here.\n'
    )
  }

  return inspectProjectContext(repositoryRoot)
}

export async function addContextEntry(
  repositoryRoot: string,
  candidatePath: string
): Promise<ContextReport> {
  await initializeProjectContext(repositoryRoot)
  const relativePath = await resolveProjectFile(repositoryRoot, candidatePath)
  const manifest = await loadManifest(repositoryRoot)
  if (manifest.entries.some(entry => entry.path === relativePath)) {
    throw new OrdoError('CONTEXT_INVALID', `Context file is already tracked: ${relativePath}`)
  }

  const entry = Object.freeze({
    id: entryId(relativePath),
    path: relativePath,
    visibility: 'visible' as const,
    addedAt: new Date().toISOString()
  })
  await saveManifest(repositoryRoot, {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    entries: Object.freeze(
      [...manifest.entries, entry].sort((left, right) => left.id.localeCompare(right.id))
    )
  })

  return inspectProjectContext(repositoryRoot)
}

function findEntry(entries: readonly ContextEntry[], selector: string): ContextEntry {
  const normalized = selector.split(path.sep).join('/')
  const matches = entries.filter(entry => entry.id === selector || entry.path === normalized)
  if (matches.length !== 1) {
    throw new OrdoError('CONTEXT_NOT_FOUND', `Context entry not found: ${selector}`)
  }
  return matches[0] as ContextEntry
}

export async function setContextEntryVisibility(
  repositoryRoot: string,
  selector: string,
  visibility: ContextEntryVisibility
): Promise<ContextReport> {
  const manifest = await loadManifest(repositoryRoot)
  const selected = findEntry(manifest.entries, selector)
  await saveManifest(repositoryRoot, {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    entries: manifest.entries.map(entry =>
      entry.id === selected.id ? Object.freeze({ ...entry, visibility }) : entry
    )
  })
  return inspectProjectContext(repositoryRoot)
}

export async function removeContextEntry(
  repositoryRoot: string,
  selector: string
): Promise<ContextReport> {
  const manifest = await loadManifest(repositoryRoot)
  const selected = findEntry(manifest.entries, selector)
  await saveManifest(repositoryRoot, {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    entries: manifest.entries.filter(entry => entry.id !== selected.id)
  })
  return inspectProjectContext(repositoryRoot)
}

export async function inspectProjectContext(repositoryRoot: string): Promise<ContextReport> {
  const paths = contextPaths(repositoryRoot)
  const initialized = await fileExists(paths.manifestPath)
  const manifest = await loadManifest(repositoryRoot)
  const entries = await Promise.all(
    manifest.entries.map(entry => readEntryReport(repositoryRoot, entry))
  )
  const brainContent = (await fileExists(paths.brainPath))
    ? await readFile(paths.brainPath, 'utf8')
    : ''

  return Object.freeze({
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    command: 'context' as const,
    repositoryRoot,
    manifestPath: paths.manifestPath,
    brainPath: paths.brainPath,
    initialized,
    entries: Object.freeze(entries),
    summary: Object.freeze({
      visible: entries.filter(entry => entry.visibility === 'visible').length,
      hidden: entries.filter(entry => entry.visibility === 'hidden').length,
      missing: entries.filter(entry => !entry.exists).length,
      estimatedTokens:
        estimateTokens(brainContent) +
        entries
          .filter(entry => entry.visibility === 'visible')
          .reduce((total, entry) => total + entry.estimatedTokens, 0)
    })
  })
}

export async function previewProjectContext(repositoryRoot: string): Promise<ContextPreviewReport> {
  const report = await inspectProjectContext(repositoryRoot)
  const blocks: ContextBlock[] = []

  if (await fileExists(report.brainPath)) {
    const content = await readFile(report.brainPath, 'utf8')
    if (content.trim()) {
      blocks.push(
        Object.freeze({
          id: 'project-memory',
          path: '.ordo/brain.md',
          source: 'project-memory' as const,
          content,
          bytes: Buffer.byteLength(content),
          estimatedTokens: estimateTokens(content)
        })
      )
    }
  }

  for (const entry of report.entries) {
    if (entry.visibility !== 'visible' || !entry.exists) {
      continue
    }
    const safePath = await resolveProjectFile(repositoryRoot, entry.path)
    const content = await readFile(path.join(repositoryRoot, safePath), 'utf8')
    blocks.push(
      Object.freeze({
        id: entry.id,
        path: entry.path,
        source: 'tracked-file' as const,
        content,
        bytes: Buffer.byteLength(content),
        estimatedTokens: estimateTokens(content)
      })
    )
  }

  const payload = blocks
    .map(
      block => `<ordo-context source="${block.path}">\n${block.content.trimEnd()}\n</ordo-context>`
    )
    .join('\n\n')

  return Object.freeze({ ...report, command: 'context-preview' as const, blocks, payload })
}

function assertSnapshot(value: unknown, snapshotPath: string): ContextSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('CONTEXT_INVALID', `Context snapshot must be an object: ${snapshotPath}`)
  }
  const snapshot = value as Record<string, unknown>
  if (
    snapshot.schemaVersion !== CONTEXT_SCHEMA_VERSION ||
    typeof snapshot.id !== 'string' ||
    typeof snapshot.createdAt !== 'string' ||
    typeof snapshot.payloadSha256 !== 'string' ||
    typeof snapshot.estimatedTokens !== 'number' ||
    !Array.isArray(snapshot.blocks)
  ) {
    throw new OrdoError('CONTEXT_INVALID', `Invalid context snapshot: ${snapshotPath}`)
  }
  return snapshot as unknown as ContextSnapshot
}

export async function snapshotProjectContext(
  repositoryRoot: string
): Promise<ContextSnapshotReport> {
  const preview = await previewProjectContext(repositoryRoot)
  const payloadSha256 = sha256(preview.payload)
  const id = payloadSha256.slice(0, 20)
  const { snapshotsDirectory } = contextPaths(repositoryRoot)
  const snapshotPath = path.join(snapshotsDirectory, `${id}.json`)
  await mkdir(snapshotsDirectory, { recursive: true })

  if (await fileExists(snapshotPath)) {
    const snapshot = assertSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')), snapshotPath)
    if (snapshot.payloadSha256 !== payloadSha256 || snapshot.id !== id) {
      throw new OrdoError('CONTEXT_INVALID', `Context snapshot checksum mismatch: ${snapshotPath}`)
    }
    return Object.freeze({
      ...preview,
      command: 'context-snapshot' as const,
      snapshotPath,
      snapshot,
      created: false
    })
  }

  const blocks: readonly ContextSnapshotBlock[] = Object.freeze(
    preview.blocks.map(block => Object.freeze({ ...block, sha256: sha256(block.content) }))
  )
  const snapshot: ContextSnapshot = Object.freeze({
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    id,
    createdAt: new Date().toISOString(),
    payloadSha256,
    estimatedTokens: preview.summary.estimatedTokens,
    blocks
  })
  const temporaryPath = path.join(snapshotsDirectory, `.${id}-${randomUUID()}.tmp`)
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' })
  await rename(temporaryPath, snapshotPath)

  return Object.freeze({
    ...preview,
    command: 'context-snapshot' as const,
    snapshotPath,
    snapshot,
    created: true
  })
}
