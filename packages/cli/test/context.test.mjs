import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../dist/program.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function captureOutput() {
  let output = ''
  return { read: () => output, write: chunk => (output += chunk) }
}

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-context-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, '.git'))
  await mkdir(path.join(directory, 'docs'))
  await writeFile(path.join(directory, 'package.json'), '{"name":"context-fixture"}\n')
  await writeFile(path.join(directory, 'docs', 'domain.md'), '# Domain\n\nOrders are immutable.\n')
  return directory
}

async function execute(args, directory) {
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(args, { cwd: directory, stdout, stderr, env: {} })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

test('context commands initialize, track, hide, show, remove, and preview', async () => {
  const repository = await createRepository()
  assert.equal((await execute(['context', 'init'], repository)).exitCode, 0)

  const added = await execute(['context', 'add', 'docs/domain.md', '--json'], repository)
  assert.equal(added.exitCode, 0)
  const entry = JSON.parse(added.stdout).entries[0]
  assert.equal(entry.path, 'docs/domain.md')

  const preview = await execute(['context', 'preview', '--json'], repository)
  assert.match(JSON.parse(preview.stdout).payload, /Orders are immutable/)

  const snapshot = JSON.parse((await execute(['context', 'snapshot', '--json'], repository)).stdout)
  assert.equal(snapshot.command, 'context-snapshot')
  assert.equal(snapshot.created, true)
  assert.equal(snapshot.snapshot.payloadSha256.length, 64)

  assert.equal(
    JSON.parse((await execute(['context', 'hide', entry.id, '--json'], repository)).stdout)
      .entries[0].visibility,
    'hidden'
  )
  assert.equal(
    JSON.parse((await execute(['context', 'show', entry.id, '--json'], repository)).stdout)
      .entries[0].visibility,
    'visible'
  )
  assert.equal(
    JSON.parse((await execute(['context', 'remove', entry.id, '--json'], repository)).stdout)
      .entries.length,
    0
  )
})

test('context help documents the repository-local workflow', async () => {
  const repository = await createRepository()
  const result = await execute(['context', '--help'], repository)

  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /ordo context preview/)
  assert.match(result.stdout, /exact\s+context blocks/)
})
