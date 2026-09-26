import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../dist/program.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(temporaryDirectories.map(root => rm(root, { recursive: true, force: true })))
})

function writer() {
  let value = ''
  return { write: chunk => (value += chunk), read: () => value }
}

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-cli-brainstorm-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  await writeFile(path.join(root, 'package.json'), '{"name":"brainstorm"}\n')
  return root
}

async function execute(root, args) {
  const stdout = writer()
  const stderr = writer()
  const exitCode = await runCli(args, { cwd: root, stdout, stderr, env: {} })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

test('brainstorm CLI diverges, converges, and crystallizes a spec', async () => {
  const root = await repository()
  const created = JSON.parse(
    (
      await execute(root, [
        'brainstorm',
        'create',
        '--title',
        'Checkout design',
        '--problem',
        'Choose consistency',
        '--question',
        'What is the latency budget?',
        '--json'
      ])
    ).stdout
  )
  const id = created.exploration.id
  const added = await execute(root, [
    'brainstorm',
    'add',
    id,
    '--id',
    'saga',
    '--title',
    'Saga',
    '--summary',
    'Use compensating actions',
    '--benefit',
    'Independent services',
    '--tradeoff',
    'Eventual consistency',
    '--risk',
    'Compensation gaps',
    '--json'
  ])
  assert.equal(added.exitCode, 0)
  await execute(root, ['brainstorm', 'select', id, '--alternative', 'saga', '--json'])
  const preview = JSON.parse(
    (
      await execute(root, [
        'brainstorm',
        'crystallize',
        id,
        '--acceptance',
        'Retries do not duplicate orders',
        '--dry-run',
        '--json'
      ])
    ).stdout
  )
  const crystallized = JSON.parse(
    (
      await execute(root, [
        'brainstorm',
        'crystallize',
        id,
        '--acceptance',
        'Retries do not duplicate orders',
        '--json'
      ])
    ).stdout
  )

  assert.equal(preview.dryRun, true)
  assert.match(preview.specContent, /Retries do not duplicate orders/)
  assert.equal(crystallized.exploration.status, 'crystallized')
  assert.equal(crystallized.spec.id, 'checkout-design')
  assert.equal(
    JSON.parse((await execute(root, ['spec', 'validate', 'checkout-design', '--json'])).stdout)
      .validation.valid,
    true
  )
})
