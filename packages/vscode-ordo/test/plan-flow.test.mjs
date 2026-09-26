import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  createPlan,
  createSpec,
  initializeProjectContext,
  listPlans,
  listSpecs,
  validatePlan
} from '@pompeitech/ordo-core'
import { buildImplementationPlanOptions } from '../dist/plan-input.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

// Same shared-project fixture the packaged desktop smoke opens.
async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-plan-flow-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  await initializeProjectContext(root)
  await createSpec(root, {
    title: 'Smoke test requirement',
    objective: 'Allow the team to verify a preinstalled Ordo workspace.',
    acceptanceCriteria: '- The shared requirement is visible in the project.'
  })
  const [spec] = await listSpecs(root)
  return { root, spec }
}

const guidedInput = {
  title: 'Smoke test requirement implementation',
  firstStep: 'Render the shared requirement in Project Home',
  expectedOutput: 'The requirement title is listed under Specifications',
  verification: 'pnpm test; open the fixture in Ordo Desktop'
}

test('the guided plan flow writes a valid plan linked to the shared spec', async () => {
  const { root, spec } = await createFixture()

  const plan = await createPlan(root, buildImplementationPlanOptions(spec, guidedInput))

  const file = path.join(root, '.ordo', 'plans', `${plan.id}.json`)
  const report = await validatePlan(root, plan.id)
  assert.equal(report.valid, true, report.errors.join('; '))
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), JSON.parse(JSON.stringify(plan)))
  assert.equal(plan.specId, spec.id)
  assert.equal(plan.status, 'ready')
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].status, 'pending')
  assert.deepEqual(plan.steps[0].verification, ['pnpm test', 'open the fixture in Ordo Desktop'])
  // The step input must point at the real shared spec, not a guessed path.
  await access(path.join(root, plan.steps[0].inputs[0]))
  assert.deepEqual(
    (await listPlans(root)).map(entry => entry.id),
    [plan.id]
  )
})

test('creating the same plan twice never overwrites the shared plan', async () => {
  const { root, spec } = await createFixture()
  const options = buildImplementationPlanOptions(spec, guidedInput)
  const plan = await createPlan(root, options)
  const file = path.join(root, '.ordo', 'plans', `${plan.id}.json`)
  const original = await readFile(file, 'utf8')

  await assert.rejects(
    createPlan(
      root,
      buildImplementationPlanOptions(spec, { ...guidedInput, firstStep: 'Something else' })
    ),
    /Plan already exists/
  )
  assert.equal(await readFile(file, 'utf8'), original)
})

test('a plan for a missing spec is rejected without writing anything', async () => {
  const { root } = await createFixture()

  await assert.rejects(
    createPlan(
      root,
      buildImplementationPlanOptions({ id: 'missing-spec', title: 'Missing' }, guidedInput)
    )
  )
  await assert.rejects(readdir(path.join(root, '.ordo', 'plans')), { code: 'ENOENT' })
})
