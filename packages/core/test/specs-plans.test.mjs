import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  createPlan,
  createSpec,
  finishPlanStep,
  listPlans,
  listSpecs,
  readPlan,
  readSpec,
  readyPlanSteps,
  startPlanStep,
  updateSpecStatus,
  validatePlan,
  validateSpec
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-artifacts-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  return root
}

async function fixtureSpec(root) {
  return createSpec(root, {
    title: 'Safe checkout',
    objective: 'Let a customer complete checkout safely.',
    acceptanceCriteria: '- A valid order is persisted.\n- Invalid payment is rejected.',
    requirements: '- Validate payment before persistence.'
  })
}

test('creates, parses, lists and transitions a Markdown spec', async () => {
  const root = await repository()
  const created = await fixtureSpec(root)
  const report = await validateSpec(root, created.id)
  const updated = await updateSpecStatus(root, created.id, 'ready')

  assert.equal(report.valid, true)
  assert.equal(report.spec.objective, 'Let a customer complete checkout safely.')
  assert.equal((await readSpec(root, created.id)).status, 'ready')
  assert.equal(updated.status, 'ready')
  assert.deepEqual(
    (await listSpecs(root)).map(spec => spec.id),
    ['safe-checkout']
  )
})

test('reports malformed spec sections without accepting the artifact', async () => {
  const root = await repository()
  await mkdir(path.join(root, '.ordo', 'specs'), { recursive: true })
  await writeFile(
    path.join(root, '.ordo', 'specs', 'broken.md'),
    '---\nschemaVersion: 1\nid: "broken"\ntitle: "Broken"\nstatus: "draft"\ncreatedAt: "now"\nupdatedAt: "now"\n---\n\n# Broken\n'
  )
  const report = await validateSpec(root, 'broken')
  assert.equal(report.valid, false)
  assert.ok(report.errors.some(error => error.includes('Objective')))
})

test('validates plan dependencies and prevents blocked execution', async () => {
  const root = await repository()
  const spec = await fixtureSpec(root)
  const plan = await createPlan(root, {
    title: 'Checkout implementation',
    specId: spec.id,
    steps: [
      {
        id: 'contract',
        description: 'Define the checkout contract',
        expectedOutput: 'Typed contract',
        verification: ['Run typecheck']
      },
      {
        id: 'implementation',
        description: 'Implement checkout',
        expectedOutput: 'Working checkout',
        dependsOn: ['contract'],
        verification: ['Run checkout tests']
      }
    ]
  })

  assert.equal((await validatePlan(root, plan.id)).valid, true)
  assert.deepEqual(
    readyPlanSteps(plan).map(step => step.id),
    ['contract']
  )
  await assert.rejects(startPlanStep(root, plan.id, 'implementation'), /blocked/)

  const running = await startPlanStep(root, plan.id, 'contract', 'session-1')
  assert.equal(running.status, 'running')
  await assert.rejects(startPlanStep(root, plan.id, 'implementation'), /already running/)
  const afterFirst = await finishPlanStep(root, plan.id, 'contract', 'completed')
  assert.deepEqual(
    readyPlanSteps(afterFirst).map(step => step.id),
    ['implementation']
  )
  await startPlanStep(root, plan.id, 'implementation', 'session-2')
  const completed = await finishPlanStep(root, plan.id, 'implementation', 'completed')

  assert.equal(completed.status, 'completed')
  assert.equal((await readPlan(root, plan.id)).status, 'completed')
  assert.equal((await listPlans(root)).length, 1)
})

test('allows human review to finish a plan step paused by the agent workflow', async () => {
  const root = await repository()
  const spec = await fixtureSpec(root)
  const plan = await createPlan(root, {
    title: 'Reviewable implementation',
    specId: spec.id,
    steps: [
      {
        id: 'implement',
        description: 'Implement it',
        expectedOutput: 'Code',
        verification: ['test']
      }
    ]
  })
  await startPlanStep(root, plan.id, 'implement', 'session-1')
  const paused = await finishPlanStep(root, plan.id, 'implement', 'paused')
  assert.equal(paused.steps[0].status, 'paused')

  const reviewed = await finishPlanStep(root, plan.id, 'implement', 'completed')
  assert.equal(reviewed.steps[0].status, 'completed')
  assert.equal(reviewed.status, 'completed')
})

test('rejects cyclic or unknown plan dependencies', async () => {
  const root = await repository()
  const spec = await fixtureSpec(root)
  await assert.rejects(
    createPlan(root, {
      title: 'Cyclic plan',
      specId: spec.id,
      steps: [
        {
          id: 'one',
          description: 'One',
          expectedOutput: 'One done',
          dependsOn: ['two'],
          verification: ['Check one']
        },
        {
          id: 'two',
          description: 'Two',
          expectedOutput: 'Two done',
          dependsOn: ['one'],
          verification: ['Check two']
        }
      ]
    }),
    /Plan is invalid/
  )
})
