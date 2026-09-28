import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeEstimate, runHarnesses } from '../dist/run-model.js'

const connection = (id, name, status) => ({
  id,
  name,
  status,
  version: '1.0.0',
  auth: status === 'connected' ? 'Signed in via claude.ai' : undefined
})

test('every agent is listed; only connected ones can run, the others say why', () => {
  assert.deepEqual(
    runHarnesses([
      connection('claude-code', 'Claude Code', 'connected'),
      { ...connection('codex', 'Codex', 'not-authenticated'), message: 'Run codex login' }
    ]),
    [
      {
        id: 'claude-code',
        name: 'Claude Code',
        connected: true,
        detail: '1.0.0 · Signed in via claude.ai'
      },
      { id: 'codex', name: 'Codex', connected: false, detail: 'Run codex login' }
    ]
  )
})

test('the preview states the estimated prompt size by part', () => {
  assert.equal(
    describeEstimate({
      characters: 12800,
      estimatedTokens: 3200,
      parts: [
        { name: 'Specification and plan step', estimatedTokens: 900 },
        { name: 'Project context', estimatedTokens: 1500 },
        { name: 'Profile instructions', estimatedTokens: 800 }
      ]
    }),
    '~3,200 tokens (Specification and plan step ~900 · Project context ~1,500 · Profile instructions ~800)'
  )
})
