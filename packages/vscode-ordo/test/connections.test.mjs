import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  billingOf,
  describeAuth,
  findHarness,
  HARNESSES,
  resolveExecutableSetting,
  toConnectionView,
  toUsageView
} from '../dist/connections.js'

const connected = {
  id: 'claude-code',
  status: 'connected',
  command: 'claude',
  message: 'ok',
  installation: { version: '2.1.0 (Claude Code)' },
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  usesApiKey: false
}

test('an empty executable path falls back to PATH and relative paths are rejected', () => {
  assert.deepEqual(resolveExecutableSetting(''), {})
  assert.deepEqual(resolveExecutableSetting('  '), {})
  assert.deepEqual(resolveExecutableSetting('/opt/claude/bin/claude'), {
    command: '/opt/claude/bin/claude'
  })
  assert.match(resolveExecutableSetting('bin/claude').error, /must be absolute/)
})

test('only Claude Code keeps an API key in the Ordo keychain; Codex stores its own', () => {
  assert.deepEqual(
    HARNESSES.map(harness => [harness.id, harness.apiKeyStorage]),
    [
      ['claude-code', 'ordo-keychain'],
      ['codex', 'harness']
    ]
  )
  assert.equal(findHarness('codex').apiKeyProvider, 'OpenAI')
  assert.equal(findHarness('not-a-harness'), undefined)
})

test('auth descriptions distinguish CLI login, Ordo API key and Codex API key login', () => {
  assert.equal(describeAuth(connected), 'Signed in via claude.ai')
  assert.equal(
    describeAuth({ ...connected, authMethod: 'api_key', apiProvider: 'bedrock' }),
    'Signed in via api_key · bedrock'
  )
  assert.equal(
    describeAuth({ ...connected, authMethod: 'api_key', usesApiKey: true }),
    'Using your Anthropic API key from the system keychain'
  )
  assert.equal(
    describeAuth({ ...connected, id: 'codex', authMethod: 'api-key' }),
    'Signed in with an API key stored by Codex'
  )
  assert.equal(describeAuth({ ...connected, status: 'not-authenticated' }), undefined)
})

test('connection views carry status and key storage but never credentials', () => {
  const view = toConnectionView(findHarness('claude-code'), '', connected, true)
  assert.deepEqual(view, {
    id: 'claude-code',
    name: 'Claude Code',
    status: 'connected',
    command: 'claude',
    configuredPath: '',
    version: '2.1.0 (Claude Code)',
    auth: 'Signed in via claude.ai',
    message: 'ok',
    apiKeyProvider: 'Anthropic',
    apiKeyStorage: 'ordo-keychain',
    hasStoredApiKey: true,
    billing: 'plan'
  })
})

test('billing tells plan subscriptions apart from pay-as-you-go keys and clouds', () => {
  assert.equal(billingOf(connected), 'plan')
  assert.equal(billingOf({ ...connected, id: 'codex', authMethod: 'chatgpt' }), 'plan')
  assert.equal(billingOf({ ...connected, usesApiKey: true, authMethod: 'api_key' }), 'api-key')
  assert.equal(billingOf({ ...connected, id: 'codex', authMethod: 'api-key' }), 'api-key')
  assert.equal(billingOf({ ...connected, apiProvider: 'bedrock' }), 'api-key')
  assert.equal(billingOf({ ...connected, status: 'not-authenticated' }), 'unknown')
})

test('usage views show plan windows, or explain why there are none', () => {
  const claude = findHarness('claude-code')
  const usage = {
    id: 'claude-code',
    source: 'last-run',
    observedAt: '2026-09-25T18:30:00.000Z',
    windows: [{ kind: 'weekly', usedPercent: 79, resetsAt: '2026-09-26T17:00:00.000Z' }]
  }
  assert.deepEqual(toUsageView(claude, 'plan', usage), {
    id: 'claude-code',
    name: 'Claude Code',
    billing: 'plan',
    source: 'last-run',
    observedAt: '2026-09-25T18:30:00.000Z',
    plan: undefined,
    windows: usage.windows
  })
  assert.match(toUsageView(claude, 'plan', undefined).note, /next Claude Code run/)
  const keyed = toUsageView(claude, 'api-key', usage)
  assert.deepEqual(keyed.windows, [])
  assert.match(keyed.note, /Pay-as-you-go/)
})
