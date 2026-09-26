import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  addExploreAlternative,
  appendSessionEvent,
  approveArchitectureProposal,
  createArchitectureProposal,
  createExplore,
  createPlan,
  createSession,
  createSpec,
  finishPlanStep,
  linkExploreSpec,
  readAuditEvents,
  readPlan,
  reviewPlanStep,
  selectExploreAlternative,
  startPlanStep,
  updateSpecStatus,
  workflowStatus,
  workflowTrail
} from '../dist/index.js'

delete process.env.ORDO_ACTOR
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

async function createRepository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-lifecycle-'))
  temporaryDirectories.push(root)
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'Ada Lovelace')
  git(root, 'config', 'user.email', 'ada@example.com')
  git(root, 'config', 'commit.gpgsign', 'false')
  return root
}

function phase(item, name) {
  return item.phases.find(entry => entry.phase === name)
}

const specInput = title => ({
  title,
  objective: `${title} for customers.`,
  acceptanceCriteria: '- It works.'
})

async function crystallizedRequirement(root) {
  const explore = await createExplore(root, {
    title: 'Payment safety',
    problem: 'Invalid payments reach the order store.'
  })
  await addExploreAlternative(root, explore.id, {
    title: 'Validate before persistence',
    summary: 'Reject invalid payments before saving the order.',
    tradeoffs: ['Adds latency to checkout']
  })
  await addExploreAlternative(root, explore.id, {
    title: 'Reconcile afterwards',
    summary: 'Save first and clean up invalid orders in a batch job.',
    tradeoffs: ['Invalid orders are visible for a while']
  })
  await selectExploreAlternative(root, explore.id, 'validate-before-persistence')
  const spec = await createSpec(root, specInput('Safe checkout'))
  await linkExploreSpec(root, explore.id, spec.id)
  return { explore, spec }
}

test('state changes are appended to a per-artifact audit log with the Git author', async () => {
  const root = await createRepository()
  const spec = await createSpec(root, specInput('Order audit trail'))
  await updateSpecStatus(root, spec.id, 'ready')
  await updateSpecStatus(root, spec.id, 'ready')
  process.env.ORDO_ACTOR = 'Grace Hopper'
  try {
    await updateSpecStatus(root, spec.id, 'implemented')
  } finally {
    delete process.env.ORDO_ACTOR
  }
  await appendFile(path.join(root, '.ordo', 'audit', 'spec', `${spec.id}.jsonl`), '{torn line\n')

  const events = await readAuditEvents(root, 'spec', spec.id)

  assert.deepEqual(
    events.map(event => [event.action, event.from, event.to, event.actor]),
    [
      ['created', undefined, 'draft', 'Ada Lovelace'],
      ['status-changed', 'draft', 'ready', 'Ada Lovelace'],
      ['status-changed', 'ready', 'implemented', 'Grace Hopper']
    ]
  )
  assert.doesNotMatch(JSON.stringify(events), /ada@example\.com/)
})

test('a draft requirement waits for approval and every later phase explains why', async () => {
  const root = await createRepository()
  await createSpec(root, specInput('Order audit trail'))

  const [item] = (await workflowStatus(root)).items

  assert.equal(item.currentPhase, 'spec')
  assert.equal(phase(item, 'brainstorm').state, 'skipped')
  assert.equal(phase(item, 'spec').state, 'in-progress')
  assert.equal(phase(item, 'spec').nextAction.id, 'mark-spec-ready')
  assert.equal(phase(item, 'architect').state, 'blocked')
  assert.match(phase(item, 'architect').blockedBy, /must be ready/)
  assert.equal(phase(item, 'plan').nextAction.id, 'create-plan')
  assert.equal(phase(item, 'implement').state, 'blocked')
  assert.match(phase(item, 'implement').blockedBy, /implementation plan/)
  for (const name of ['verify', 'review', 'record']) {
    assert.equal(phase(item, name).state, 'unavailable')
  }
})

test('explorations that are not crystallized yet appear with their next step', async () => {
  const root = await createRepository()
  await createExplore(root, { title: 'Faster search', problem: 'Search is slow.' })

  const [item] = (await workflowStatus(root)).items

  assert.equal(item.key, 'explore:faster-search')
  assert.equal(item.specId, undefined)
  assert.equal(phase(item, 'brainstorm').state, 'in-progress')
  assert.equal(phase(item, 'brainstorm').nextAction.id, 'add-alternative')
  assert.equal(phase(item, 'spec').state, 'not-started')
})

test('a requirement advances phase by phase through its gates', async () => {
  const root = await createRepository()
  const { spec } = await crystallizedRequirement(root)
  const current = async () => (await workflowStatus(root)).items.find(i => i.specId === spec.id)

  assert.equal(phase(await current(), 'brainstorm').state, 'done')
  await updateSpecStatus(root, spec.id, 'ready')
  assert.equal(phase(await current(), 'architect').nextAction.id, 'propose-architecture')

  const proposal = await createArchitectureProposal(root, {
    title: 'Payment validation service',
    specId: spec.id,
    impact: ['checkout'],
    components: [
      { name: 'checkout', responsibility: 'Validate payments', changes: ['add validator'] }
    ],
    contracts: ['POST /orders rejects invalid payments'],
    decisions: ['Validate synchronously before persistence']
  })
  const proposed = phase(await current(), 'architect')
  assert.equal(proposed.state, 'in-progress')
  assert.deepEqual(proposed.nextAction.target, { kind: 'architecture', id: proposal.id })
  await approveArchitectureProposal(root, proposal.id)
  assert.equal(phase(await current(), 'architect').state, 'done')

  const plan = await createPlan(root, {
    title: 'Safe checkout implementation',
    specId: spec.id,
    steps: [
      {
        id: 'validate',
        description: 'Validate payment',
        expectedOutput: 'Validator',
        verification: ['pnpm test']
      },
      {
        id: 'persist',
        description: 'Persist order',
        expectedOutput: 'Order saved',
        dependsOn: ['validate'],
        verification: ['pnpm test']
      }
    ]
  })
  let item = await current()
  assert.equal(phase(item, 'plan').state, 'done')
  assert.equal(phase(item, 'implement').nextAction.stepId, 'validate')

  await startPlanStep(root, plan.id, 'validate', 'session-1')
  assert.match(phase(await current(), 'implement').summary, /running/)
  await finishPlanStep(root, plan.id, 'validate', 'paused')
  assert.equal(phase(await current(), 'implement').nextAction.id, 'review-step')
  await finishPlanStep(root, plan.id, 'validate', 'completed')

  item = await current()
  assert.equal(phase(item, 'implement').state, 'in-progress')
  assert.equal(phase(item, 'implement').summary, '1/2 steps')
  assert.equal(phase(item, 'implement').nextAction.stepId, 'persist')
  assert.equal(item.currentPhase, 'implement')
})

test('the decision trail shows chosen and rejected alternatives with the deciding person', async () => {
  const root = await createRepository()
  const { explore, spec } = await crystallizedRequirement(root)
  await updateSpecStatus(root, spec.id, 'ready')
  git(root, 'add', '.ordo')
  git(root, 'commit', '-q', '-m', 'Add safe checkout requirement')

  const trail = await workflowTrail(root, spec.id)
  const byEvent = event => trail.entries.filter(entry => entry.event === event)

  const [choice] = byEvent('alternative-selected')
  assert.equal(choice.title, 'Chosen: Validate before persistence')
  assert.equal(choice.category, 'decision')
  assert.equal(choice.source, 'audit')
  assert.equal(choice.actor, 'Ada Lovelace')
  assert.equal(choice.actorType, 'human')
  assert.deepEqual(choice.rejected, [
    {
      id: 'reconcile-afterwards',
      title: 'Reconcile afterwards',
      tradeoffs: ['Invalid orders are visible for a while']
    }
  ])
  assert.equal(byEvent('alternative-proposed').length, 2)
  assert.equal(byEvent('explore-crystallized')[0].artifact.id, explore.id)
  const [ready] = byEvent('spec-status-changed')
  assert.equal(ready.title, 'Specification draft → ready')
  assert.equal(ready.category, 'decision')
  assert.ok(
    trail.entries.every(entry => entry.source !== 'git' && entry.event !== 'commit'),
    'the trail is built from Ordo records only, never from Git history'
  )
  const times = trail.entries.map(entry => new Date(entry.at).getTime())
  assert.deepEqual(
    times,
    [...times].sort((left, right) => left - right)
  )
})

test('artifacts written before the audit log still produce a trail, marked approximate', async () => {
  const root = await createRepository()
  const { spec } = await crystallizedRequirement(root)
  await updateSpecStatus(root, spec.id, 'ready')
  await rm(path.join(root, '.ordo', 'audit'), { recursive: true, force: true })

  const trail = await workflowTrail(root, spec.id)

  assert.ok(trail.entries.every(entry => entry.source !== 'audit'))
  const [choice] = trail.entries.filter(entry => entry.event === 'alternative-selected')
  assert.equal(choice.source, 'artifact')
  assert.equal(choice.approximate, true)
  assert.equal(choice.actor, undefined)
  assert.ok(trail.entries.some(entry => entry.event === 'spec-status' && entry.approximate))
})

async function readyPlan(root) {
  const spec = await createSpec(root, specInput('Safe checkout'))
  await updateSpecStatus(root, spec.id, 'ready')
  const plan = await createPlan(root, {
    title: 'Safe checkout implementation',
    specId: spec.id,
    steps: [
      {
        id: 'validate',
        description: 'Validate payment',
        expectedOutput: 'Validator',
        verification: ['pnpm test']
      },
      {
        id: 'persist',
        description: 'Persist order',
        expectedOutput: 'Order',
        dependsOn: ['validate'],
        verification: ['pnpm test']
      }
    ]
  })
  return { spec, plan }
}

// Mirrors what `ordo agent` records: a session with harness and usage events, then
// the step paused by Ordo for review.
async function agentRun(root, planId, stepId, { agent, tokens }) {
  const session = await createSession(root, { title: `${agent} on ${stepId}` })
  await startPlanStep(root, planId, stepId, session.id)
  await appendSessionEvent(root, session.id, {
    type: 'note',
    data: { type: 'harness', id: agent, version: '1.0.0' }
  })
  if (tokens !== undefined) {
    await appendSessionEvent(root, session.id, {
      type: 'usage',
      data: { inputTokens: tokens - 100, outputTokens: 100, totalTokens: tokens }
    })
  }
  await finishPlanStep(root, planId, stepId, 'paused', {
    actorType: 'system',
    reason: 'Agent run finished; waiting for human review'
  })
  return session
}

test('a person reviews each agent step: changes requested, rerun, then approved', async () => {
  const root = await createRepository()
  const { plan } = await readyPlan(root)

  await agentRun(root, plan.id, 'validate', { agent: 'claude-code', tokens: 42000 })
  await assert.rejects(
    reviewPlanStep(root, plan.id, 'validate', 'changes-requested'),
    /Explain what has to change/
  )
  await assert.rejects(
    reviewPlanStep(root, plan.id, 'validate', 'approved', { actorType: 'agent' }),
    /Only a person/
  )
  await reviewPlanStep(root, plan.id, 'validate', 'changes-requested', {
    note: 'Missing the CVV test'
  })
  assert.equal((await readPlan(root, plan.id)).steps[0].status, 'pending')

  await agentRun(root, plan.id, 'validate', { agent: 'claude-code', tokens: 18000 })
  await reviewPlanStep(root, plan.id, 'validate', 'approved')
  await assert.rejects(
    reviewPlanStep(root, plan.id, 'validate', 'approved'),
    /Only a step paused for review/
  )

  const updated = await readPlan(root, plan.id)
  assert.equal(updated.steps[0].status, 'completed')
  const reviews = (await readAuditEvents(root, 'plan', plan.id)).filter(
    event => event.action === 'reviewed'
  )
  assert.deepEqual(
    reviews.map(event => [event.to, event.reason, event.actorType, event.actor]),
    [
      ['changes-requested', 'Missing the CVV test', 'human', 'Ada Lovelace'],
      ['approved', undefined, 'human', 'Ada Lovelace']
    ]
  )
})

test('the trail separates people, agents and Ordo and highlights the costliest run', async () => {
  const root = await createRepository()
  const { spec, plan } = await readyPlan(root)
  await agentRun(root, plan.id, 'validate', { agent: 'claude-code', tokens: 42000 })
  await reviewPlanStep(root, plan.id, 'validate', 'changes-requested', {
    note: 'Missing the CVV test'
  })
  await agentRun(root, plan.id, 'validate', { agent: 'claude-code', tokens: 18000 })
  await reviewPlanStep(root, plan.id, 'validate', 'approved')
  await agentRun(root, plan.id, 'persist', { agent: 'codex' })

  const trail = await workflowTrail(root, spec.id)
  const sessions = trail.entries.filter(entry => entry.category === 'agent')

  assert.equal(sessions.length, 3, 'both runs of the reworked step are kept')
  assert.deepEqual(
    sessions.map(entry => [entry.actor, entry.tokens?.total, entry.mostExpensive === true]),
    [
      ['claude-code', 42000, true],
      ['claude-code', 18000, false],
      ['codex', undefined, false]
    ]
  )
  assert.deepEqual(trail.tokens, { total: 60000, unmeasuredSessions: 1 })
  const reviews = trail.entries.filter(entry => entry.event === 'plan-reviewed')
  assert.deepEqual(
    reviews.map(entry => [entry.category, entry.title, entry.detail]),
    [
      ['decision', 'Review of "validate": changes requested', 'Missing the CVV test'],
      ['decision', 'Review of "validate": approved', undefined]
    ]
  )
  const paused = trail.entries.filter(entry => entry.event === 'plan-step-finished')
  assert.ok(paused.length >= 3 && paused.every(entry => entry.category === 'system'))
  assert.ok(
    paused.every(entry => entry.actor === 'Ordo'),
    "automatic transitions are Ordo's"
  )
  const events = trail.entries.map(entry => entry.event)
  const firstRun = events.indexOf('agent-session')
  assert.equal(events[firstRun - 1], 'plan-step-started', 'an agent run follows its start')

  const [item] = (await workflowStatus(root)).items
  assert.deepEqual(item.tokens, { total: 60000, unmeasuredSessions: 1 })
  assert.equal(phase(item, 'implement').nextAction.id, 'review-step')
})

test('a step blocked in review blocks implementation with the reason', async () => {
  const root = await createRepository()
  const { plan } = await readyPlan(root)
  await agentRun(root, plan.id, 'validate', { agent: 'codex' })
  await reviewPlanStep(root, plan.id, 'validate', 'blocked', { note: 'Wrong payment provider' })

  const implement = phase((await workflowStatus(root)).items[0], 'implement')

  assert.equal(implement.state, 'blocked')
  assert.match(implement.blockedBy, /blocked in review/)
})

test('ORDO_ACTOR_TYPE lets an automation declare itself in the audit log', async () => {
  const root = await createRepository()
  process.env.ORDO_ACTOR_TYPE = 'agent'
  try {
    await createSpec(root, specInput('Automated requirement'))
  } finally {
    delete process.env.ORDO_ACTOR_TYPE
  }
  const [created] = await readAuditEvents(root, 'spec', 'automated-requirement')
  assert.equal(created.actorType, 'agent')
})
