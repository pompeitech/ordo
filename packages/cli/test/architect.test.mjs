import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-cli-architect-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  await writeFile(path.join(root, 'package.json'), '{"name":"architect"}\n')
  return root
}

async function execute(root, args) {
  const stdout = writer()
  const stderr = writer()
  const exitCode = await runCli(args, { cwd: root, stdout, stderr, env: {} })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

const createArgs = [
  'architect',
  'create',
  '--spec',
  'checkout',
  '--title',
  'Checkout architecture',
  '--impact',
  'orders module',
  '--component',
  '{"name":"OrderService","responsibility":"Persist orders","changes":["validate totals"]}',
  '--contract',
  'POST /orders returns 201',
  '--decision',
  'Use optimistic locking',
  '--risk',
  'Concurrent updates'
]

test('architect CLI previews, creates, shows, lists, and approves a proposal', async () => {
  const root = await repository()
  await execute(root, [
    'spec',
    'create',
    '--title',
    'Checkout',
    '--objective',
    'Create a safe checkout',
    '--acceptance',
    'A valid order succeeds'
  ])
  const target = path.join(root, '.ordo', 'architectures', 'checkout-architecture.json')

  const preview = await execute(root, [...createArgs, '--dry-run', '--json'])
  assert.equal(preview.exitCode, 0)
  assert.equal(JSON.parse(preview.stdout).dryRun, true)
  await assert.rejects(access(target))

  const created = await execute(root, createArgs)
  assert.equal(created.exitCode, 0)
  assert.match(
    created.stdout,
    /Human approval required: ordo architect approve checkout-architecture/
  )
  assert.match(created.stdout, /OrderService — Persist orders/)
  await access(target)

  const approvalPreview = JSON.parse(
    (await execute(root, ['architect', 'approve', 'checkout-architecture', '--dry-run', '--json']))
      .stdout
  )
  assert.equal(approvalPreview.proposal.status, 'approved')
  const shown = JSON.parse(
    (await execute(root, ['architect', 'show', 'checkout-architecture', '--json'])).stdout
  )
  assert.equal(shown.proposal.status, 'proposed')

  const approved = JSON.parse(
    (await execute(root, ['architect', 'approve', 'checkout-architecture', '--json'])).stdout
  )
  assert.equal(approved.proposal.status, 'approved')
  const listed = JSON.parse((await execute(root, ['architect', 'list', '--json'])).stdout)
  assert.deepEqual(
    listed.proposals.map(item => [item.id, item.status]),
    [['checkout-architecture', 'approved']]
  )

  const again = await execute(root, ['architect', 'approve', 'checkout-architecture'])
  assert.equal(again.exitCode, 1)
  assert.match(again.stderr, /cannot be approved from: approved/)
})

test('architect CLI validates arguments and exposes help', async () => {
  const root = await repository()
  const help = await execute(root, ['architect', '--help'])
  assert.equal(help.exitCode, 0)
  assert.match(help.stdout, /ordo architect create --spec <id>/)
  assert.equal((await execute(root, ['architect', 'unknown'])).exitCode, 2)
  assert.equal((await execute(root, ['architect', 'create', '--title', 'x'])).exitCode, 2)
  assert.equal((await execute(root, ['architect', 'list', '--dry-run'])).exitCode, 2)
  const invalid = await execute(root, [...createArgs.slice(0, 9), '{bad', '--json'])
  assert.equal(invalid.exitCode, 2)
  assert.match(invalid.stderr, /--component must be valid JSON/)
  const missingSpec = await execute(root, createArgs)
  assert.equal(missingSpec.exitCode, 1)
  assert.match(missingSpec.stderr, /Spec not found: checkout/)
})
