import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AuditedDecisionProvider,
  parseWorkflow,
  RuleBasedDecisionProvider,
  resolveDecision,
  runWorkflow
} from '../dist/index.js'

test('workflow parser and runner execute steps in order', async () => {
  const workflow = parseWorkflow(
    `# Test Workflow

## Objective

Verify deterministic execution.

## Steps

1. Read the repository.
2. Produce a report.

## Safety rules

- Do not modify files.

## Success

The report is complete.
`,
    '/tmp/test.md'
  )
  const executed = []
  const state = await runWorkflow(workflow, async ({ step }) => {
    executed.push(step.id)
    return step.instruction
  })

  assert.equal(state.status, 'succeeded')
  assert.deepEqual(executed, ['test:1', 'test:2'])
  assert.equal(state.results.length, 2)
})

test('rule-based decisions are validated and thresholds can escalate', async () => {
  const events = []
  const provider = new AuditedDecisionProvider(
    new RuleBasedDecisionProvider({
      choose: request => request.choices[0].value,
      score: request => request.minimum,
      assert: () => false
    }),
    { record: event => events.push(event) }
  )
  const decision = await provider.choose({
    id: 'package-manager',
    state: {},
    instructions: 'Choose from deterministic evidence.',
    choices: [
      { value: 'pnpm', description: 'pnpm lockfile exists' },
      { value: 'npm', description: 'npm lockfile exists' }
    ]
  })

  assert.equal(decision.value, 'pnpm')
  assert.deepEqual(
    events.map(event => event.requestId),
    ['package-manager']
  )
  assert.equal(resolveDecision(decision, 1).status, 'accepted')
  assert.equal(resolveDecision({ ...decision, confidence: 0.4 }, 0.8).status, 'escalate')
})
