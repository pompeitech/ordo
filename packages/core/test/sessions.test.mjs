import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  appendSessionEvent,
  createSession,
  listSessions,
  readSession,
  updateSessionStatus
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-session-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, '.git'))
  await writeFile(path.join(directory, 'package.json'), '{"name":"session-fixture"}\n')
  return directory
}

test('creates, lists, reads, and updates persistent provider-neutral sessions', async () => {
  const repository = await createRepository()
  const created = await createSession(repository, {
    title: 'Implement governed sessions',
    runtime: { provider: 'openai', model: 'example-model' },
    contextSnapshotId: 'snapshot-1',
    branch: 'main',
    headCommit: 'abc123'
  })
  const message = await appendSessionEvent(repository, created.id, {
    type: 'message',
    data: { role: 'user', content: 'Implement the session store.' }
  })
  const tool = await appendSessionEvent(repository, created.id, {
    type: 'tool-call',
    data: { tool: 'read_file', arguments: { path: 'README.md' } }
  })
  const updated = await updateSessionStatus(repository, created.id, 'completed')
  const detail = await readSession(repository, created.id)
  const sessions = await listSessions(repository)

  assert.equal(message.sequence, 1)
  assert.equal(tool.sequence, 2)
  assert.equal(updated.status, 'completed')
  assert.equal(detail.session.runtime.provider, 'openai')
  assert.equal(detail.session.contextSnapshotId, 'snapshot-1')
  assert.deepEqual(
    detail.events.map(event => event.type),
    ['message', 'tool-call']
  )
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, created.id)
})

test('rejects invalid sessions and preserves event ordering', async () => {
  const repository = await createRepository()
  await assert.rejects(createSession(repository, { title: '   ' }), error => {
    assert.equal(error.code, 'SESSION_INVALID')
    return true
  })
  await assert.rejects(readSession(repository, 'not-a-session'), error => {
    assert.equal(error.code, 'SESSION_NOT_FOUND')
    return true
  })
})

test('persists the exact shared profile selection on a session', async () => {
  const repository = await createRepository()
  const selection = {
    profileSha256: 'a'.repeat(64),
    agent: { id: 'architect', mode: 'default', contentSha256: 'b'.repeat(64) },
    skills: [{ id: 'testing', mode: 'enabled', contentSha256: 'c'.repeat(64) }],
    rules: [{ id: 'safe', mode: 'required', contentSha256: 'd'.repeat(64) }],
    workflows: []
  }
  const created = await createSession(repository, {
    title: 'Profile-linked work',
    profileSelection: selection
  })
  const detail = await readSession(repository, created.id)

  assert.deepEqual(detail.session.profileSelection, selection)
})
