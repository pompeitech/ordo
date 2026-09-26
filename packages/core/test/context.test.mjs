import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  addContextEntry,
  initializeProjectContext,
  previewProjectContext,
  removeContextEntry,
  setContextEntryVisibility,
  snapshotProjectContext
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-context-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, 'docs', 'domain'), { recursive: true })
  await writeFile(path.join(directory, 'package.json'), '{"name":"context-fixture"}\n')
  await writeFile(
    path.join(directory, 'docs', 'domain', 'invariants.md'),
    '# Invariants\n\nTenant data never crosses boundaries.\n'
  )
  return directory
}

test('initializes repository-local project memory without overwriting it', async () => {
  const repository = await createRepository()
  const first = await initializeProjectContext(repository)
  await writeFile(first.brainPath, '# Project memory\n\nCustom knowledge.\n')
  const second = await initializeProjectContext(repository)

  assert.equal(first.initialized, true)
  assert.equal(second.initialized, true)
  assert.equal(await readFile(second.brainPath, 'utf8'), '# Project memory\n\nCustom knowledge.\n')
  assert.deepEqual(JSON.parse(await readFile(second.manifestPath, 'utf8')), {
    schemaVersion: 1,
    entries: []
  })
})

test('tracks visibility and previews the exact context payload', async () => {
  const repository = await createRepository()
  await initializeProjectContext(repository)
  const added = await addContextEntry(repository, 'docs/domain/invariants.md')
  const entry = added.entries[0]

  assert.equal(entry.path, 'docs/domain/invariants.md')
  assert.equal(entry.visibility, 'visible')

  const preview = await previewProjectContext(repository)
  assert.equal(preview.blocks.length, 2)
  assert.match(preview.payload, /source="\.ordo\/brain\.md"/)
  assert.match(preview.payload, /Tenant data never crosses boundaries/)
  assert.ok(preview.summary.estimatedTokens > 0)

  const hidden = await setContextEntryVisibility(repository, entry.id, 'hidden')
  assert.equal(hidden.entries[0].visibility, 'hidden')
  assert.doesNotMatch((await previewProjectContext(repository)).payload, /Tenant data/)

  const removed = await removeContextEntry(repository, entry.path)
  assert.equal(removed.entries.length, 0)
})

test('adding the first entry initializes project memory automatically', async () => {
  const repository = await createRepository()
  const report = await addContextEntry(repository, 'docs/domain/invariants.md')

  assert.equal(report.initialized, true)
  assert.match(await readFile(report.brainPath, 'utf8'), /# Project memory/)
})

test('creates immutable content-addressed snapshots and reuses identical payloads', async () => {
  const repository = await createRepository()
  await addContextEntry(repository, 'docs/domain/invariants.md')

  const first = await snapshotProjectContext(repository)
  const second = await snapshotProjectContext(repository)
  const stored = JSON.parse(await readFile(first.snapshotPath, 'utf8'))

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.snapshotPath, first.snapshotPath)
  assert.equal(stored.id, first.snapshot.id)
  assert.equal(stored.payloadSha256.length, 64)
  assert.equal(stored.blocks.length, 2)
  assert.ok(stored.blocks.every(block => block.sha256.length === 64))
})

test('rejects context files outside the repository', async () => {
  const repository = await createRepository()
  await initializeProjectContext(repository)

  await assert.rejects(
    addContextEntry(repository, path.join(repository, '..', 'outside.md')),
    error => error.code === 'PATH_UNSAFE'
  )
})
