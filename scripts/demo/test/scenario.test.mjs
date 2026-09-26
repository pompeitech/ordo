import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  readPlan,
  stepChanges,
  workflowStatus,
  workflowTrail
} from '../../../packages/core/dist/index.js'
import { createDemoScenario } from '../scenario.mjs'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

test('the demo scenario shows every workflow feature the presenter walks through', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-demo-scenario-'))
  temporaryDirectories.push(root)
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Demo Presenter'], { cwd: root })

  const { specId } = await createDemoScenario(root)
  const items = (await workflowStatus(root)).items
  const trail = await workflowTrail(root, specId)

  assert.deepEqual(items.map(item => item.title).sort(), [
    'Faster product search',
    'Order audit trail',
    'Safe checkout'
  ])
  const checkout = items.find(item => item.specId === specId)
  const implement = checkout.phases.find(phase => phase.phase === 'implement')
  assert.equal(implement.nextAction.id, 'review-step')
  assert.equal(implement.nextAction.stepId, 'errors')
  assert.deepEqual(checkout.tokens, { total: 69000, unmeasuredSessions: 1 })
  const categories = new Set(trail.entries.map(entry => entry.category))
  for (const category of ['decision', 'agent', 'system', 'activity']) {
    assert.ok(categories.has(category), `the replay shows ${category} entries`)
  }
  const top = trail.entries.find(entry => entry.mostExpensive)
  assert.equal(top.tokens.total, 42000)
  assert.ok(trail.entries.some(entry => entry.title.includes('changes requested')))
  const firstReview = trail.entries.find(entry => entry.event === 'plan-reviewed')
  assert.deepEqual(firstReview.files.rejected, ['src/legacy-validation.ts'])
  await access(path.join(root, 'src/legacy-validation.ts'))

  const plan = await readPlan(root, 'safe-checkout-implementation')
  const waiting = await stepChanges(root, plan, 'errors')
  assert.deepEqual(
    waiting.files.map(file => [file.path, file.change]),
    [
      ['README.md', 'modified'],
      ['src/checkout.ts', 'modified'],
      ['src/errors.ts', 'added']
    ]
  )
})
