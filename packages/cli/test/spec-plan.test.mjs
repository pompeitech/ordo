import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-artifacts-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, '.git'))
  await writeFile(path.join(directory, 'package.json'), '{"name":"artifact-fixture"}\n')
  return directory
}

async function execute(args, directory) {
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(args, { cwd: directory, stdout, stderr, env: {} })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

async function createSpec(repository) {
  return execute(
    [
      'spec',
      'create',
      '--title',
      'Checkout',
      '--objective',
      'Create a safe checkout',
      '--acceptance',
      'A valid order succeeds',
      '--json'
    ],
    repository
  )
}

test('spec CLI previews, creates, validates and updates status', async () => {
  const repository = await createRepository()
  const preview = await execute(
    [
      'spec',
      'create',
      '--title',
      'Preview only',
      '--objective',
      'Do not write',
      '--acceptance',
      'No file exists',
      '--dry-run',
      '--json'
    ],
    repository
  )
  assert.equal(JSON.parse(preview.stdout).dryRun, true)
  await assert.rejects(access(path.join(repository, '.ordo', 'specs', 'preview-only.md')))

  const created = JSON.parse((await createSpec(repository)).stdout)
  const validated = await execute(['spec', 'validate', created.spec.id, '--json'], repository)
  const status = JSON.parse(
    (await execute(['spec', 'status', created.spec.id, '--status', 'ready', '--json'], repository))
      .stdout
  )
  assert.equal(validated.exitCode, 0)
  assert.equal(JSON.parse(validated.stdout).validation.valid, true)
  assert.equal(status.spec.status, 'ready')
})

test('plan CLI enforces dependencies and exposes dry-run selection', async () => {
  const repository = await createRepository()
  const spec = JSON.parse((await createSpec(repository)).stdout).spec
  const first = JSON.stringify({
    id: 'contract',
    description: 'Define contract',
    expectedOutput: 'Contract exists',
    verification: ['typecheck passes']
  })
  const second = JSON.stringify({
    id: 'implementation',
    description: 'Implement checkout',
    expectedOutput: 'Checkout works',
    dependsOn: ['contract'],
    verification: ['tests pass']
  })
  const created = JSON.parse(
    (
      await execute(
        [
          'plan',
          'create',
          '--title',
          'Checkout plan',
          '--spec',
          spec.id,
          '--step',
          first,
          '--step',
          second,
          '--json'
        ],
        repository
      )
    ).stdout
  )
  const blocked = await execute(
    ['plan', 'run', created.plan.id, '--step-id', 'implementation', '--json'],
    repository
  )
  const preview = JSON.parse(
    (
      await execute(
        ['plan', 'run', created.plan.id, '--step-id', 'contract', '--dry-run', '--json'],
        repository
      )
    ).stdout
  )
  const started = JSON.parse(
    (await execute(['plan', 'run', created.plan.id, '--step-id', 'contract', '--json'], repository))
      .stdout
  )

  assert.equal(blocked.exitCode, 3)
  assert.match(blocked.stderr, /blocked/)
  assert.equal(preview.selectedStepId, 'contract')
  assert.equal(preview.dryRun, true)
  assert.equal(started.plan.steps[0].status, 'running')
})
