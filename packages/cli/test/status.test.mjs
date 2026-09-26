import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  createPlan,
  createSpec,
  finishPlanStep,
  startPlanStep,
  updateSpecStatus
} from '@pompeitech/ordo-core'
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

async function execute(args, directory) {
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(args, {
    cwd: directory,
    stdout,
    stderr,
    env: { ORDO_ACTOR: 'Test Runner' }
  })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

async function createRepository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-cli-status-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  const draft = await createSpec(root, {
    title: 'Order audit trail',
    objective: 'Trace every order change.',
    acceptanceCriteria: '- Each change records actor and time.'
  })
  const ready = await createSpec(root, {
    title: 'Safe checkout',
    objective: 'Reject invalid payments.',
    acceptanceCriteria: '- Invalid cards are rejected.'
  })
  await updateSpecStatus(root, ready.id, 'ready')
  await createPlan(root, {
    title: 'Safe checkout implementation',
    specId: ready.id,
    steps: [
      {
        id: 'validate',
        description: 'Validate payment',
        expectedOutput: 'Validator',
        verification: ['pnpm test']
      }
    ]
  })
  return { root, draft, ready }
}

test('status reports every requirement across the workflow as JSON', async () => {
  const { root, draft, ready } = await createRepository()

  const run = await execute(['status', '--json'], root)

  assert.equal(run.exitCode, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  assert.equal(report.command, 'status')
  const byKey = Object.fromEntries(report.items.map(item => [item.key, item]))
  assert.equal(byKey[`spec:${draft.id}`].currentPhase, 'spec')
  const checkout = byKey[`spec:${ready.id}`]
  assert.equal(checkout.currentPhase, 'implement')
  const implement = checkout.phases.find(phase => phase.phase === 'implement')
  assert.deepEqual(implement.nextAction, {
    id: 'run-step',
    label: 'Run "validate"',
    target: { kind: 'plan', id: 'safe-checkout-implementation' },
    stepId: 'validate'
  })
})

test('status prints the pipeline with blockers and next steps', async () => {
  const { root } = await createRepository()

  const run = await execute(['status'], root)

  assert.equal(run.exitCode, 0, run.stderr)
  assert.match(run.stdout, /WORKFLOW/)
  assert.match(run.stdout, /Order audit trail/)
  assert.match(run.stdout, /blocked: Waiting for business approval to mark it ready/)
  assert.match(run.stdout, /next: Run "validate"/)
  assert.match(run.stdout, /· not available yet/)
})

test('status --spec prints the decision trail with actor and source', async () => {
  const { root, ready } = await createRepository()

  const json = await execute(['status', '--spec', ready.id, '--json'], root)
  const human = await execute(['status', '--spec', ready.id], root)

  assert.equal(json.exitCode, 0, json.stderr)
  const report = JSON.parse(json.stdout)
  assert.equal(report.command, 'status-trail')
  assert.deepEqual(
    report.trail.entries.map(entry => [entry.event, entry.source]),
    [
      ['spec-created', 'audit'],
      ['spec-status-changed', 'audit'],
      ['plan-created', 'audit']
    ]
  )
  assert.match(human.stdout, /DECISION TRAIL · SAFE CHECKOUT/)
  assert.match(human.stdout, /👤 spec +Specification draft → ready/)
})

test('status rejects unknown options and a missing spec id', async () => {
  const { root } = await createRepository()

  const unknown = await execute(['status', '--nope'], root)
  const missing = await execute(['status', '--spec'], root)

  assert.notEqual(unknown.exitCode, 0)
  assert.match(unknown.stderr, /Unknown option for status/)
  assert.notEqual(missing.exitCode, 0)
  assert.match(missing.stderr, /requires a specification id/)
})

test('plan review records a person decision and sends a step back or completes it', async () => {
  const { root, ready } = await createRepository()
  const plan = 'safe-checkout-implementation'
  await startPlanStep(root, plan, 'validate')
  await finishPlanStep(root, plan, 'validate', 'paused', { actorType: 'system' })

  const noNote = await execute(
    ['plan', 'review', plan, '--step-id', 'validate', '--decision', 'changes-requested'],
    root
  )
  const back = await execute(
    [
      'plan',
      'review',
      plan,
      '--step-id',
      'validate',
      '--decision',
      'changes-requested',
      '--note',
      '-- add the CVV test',
      '--json'
    ],
    root
  )
  const invalid = await execute(
    ['plan', 'review', plan, '--step-id', 'validate', '--decision', 'maybe'],
    root
  )

  assert.notEqual(noNote.exitCode, 0)
  assert.match(noNote.stderr, /Explain what has to change/)
  assert.equal(back.exitCode, 0, back.stderr)
  assert.equal(JSON.parse(back.stdout).plan.steps[0].status, 'pending')
  assert.notEqual(invalid.exitCode, 0)
  assert.match(invalid.stderr, /--decision must be/)
  const trail = JSON.parse((await execute(['status', '--spec', ready.id, '--json'], root)).stdout)
  const review = trail.trail.entries.find(entry => entry.event === 'plan-reviewed')
  assert.equal(review.category, 'decision')
  assert.equal(review.detail, '-- add the CVV test')
})
