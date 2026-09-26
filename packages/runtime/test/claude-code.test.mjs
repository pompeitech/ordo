import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  AgentAdapterError,
  AgentAdapterRegistry,
  claudeCodeAgentAdapter,
  claudeCodeCapabilities
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createCommand(source) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-claude-adapter-'))
  temporaryDirectories.push(directory)
  const command = path.join(directory, 'fake-claude')
  await writeFile(command, `#!/usr/bin/env node\n${source}\n`)
  await chmod(command, 0o755)
  return { directory, command }
}

test('adapter registry sorts entries and rejects duplicate or unknown ids', () => {
  const adapter = claudeCodeAgentAdapter
  const codexAdapter = { id: 'codex', async detect() {}, async run() {} }
  const registry = new AgentAdapterRegistry([codexAdapter, adapter])
  assert.equal(registry.has('claude-code'), true)
  assert.deepEqual(
    registry.list().map(entry => entry.id),
    ['claude-code', 'codex']
  )
  assert.throws(
    () => registry.register(adapter),
    error => {
      assert.ok(error instanceof AgentAdapterError)
      assert.equal(error.code, 'AGENT_ADAPTER_DUPLICATE')
      return true
    }
  )
  assert.throws(
    () => new AgentAdapterRegistry([adapter]).get('codex'),
    error => {
      assert.equal(error.code, 'AGENT_ADAPTER_NOT_FOUND')
      return true
    }
  )
})

test('Claude adapter reports explicit runtime capabilities and normalizes a streamed run', async () => {
  const fixture = await createCommand(`
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code test-version\\n')
  process.exit(0)
}
const event = (value) => process.stdout.write(JSON.stringify(value) + '\\n')
event({type:'stream_event',session_id:'native-123',event:{delta:{type:'text_delta',text:'Hello'}}})
event({type:'result',session_id:'native-123',result:'Hello',usage:{input_tokens:4,output_tokens:2}})
`)
  const installation = await claudeCodeAgentAdapter.detect({
    command: fixture.command,
    cwd: fixture.directory
  })
  const events = []
  const result = await claudeCodeAgentAdapter.run({
    command: fixture.command,
    cwd: fixture.directory,
    prompt: 'Say hello.',
    onEvent(event) {
      events.push(event)
    }
  })

  assert.equal(installation.id, 'claude-code')
  assert.equal(installation.version, 'Claude Code test-version')
  assert.deepEqual(installation.capabilities, claudeCodeCapabilities)
  assert.deepEqual(installation.capabilities, {
    streaming: true,
    usage: true,
    cancellation: true,
    resume: false,
    'approval-requests': false
  })
  assert.deepEqual(result, { text: 'Hello', nativeSessionId: 'native-123', exitCode: 0 })
  assert.deepEqual(events, [
    { type: 'native-session', nativeSessionId: 'native-123' },
    { type: 'text-delta', text: 'Hello' },
    { type: 'usage', inputTokens: 4, outputTokens: 2 },
    { type: 'result', text: 'Hello', nativeSessionId: 'native-123' }
  ])
})

test('Claude adapter terminates its child and rejects when aborted while streaming', async () => {
  const fixture = await createCommand(`
if (process.argv[2] === '--version') process.exit(0)
process.on('SIGTERM', () => process.exit(0))
process.stdout.write(JSON.stringify({type:'stream_event',session_id:'native-cancel',event:{delta:{type:'text_delta',text:'started'}}}) + '\\n')
setInterval(() => {}, 1000)
`)
  const controller = new AbortController()
  await assert.rejects(
    claudeCodeAgentAdapter.run({
      command: fixture.command,
      cwd: fixture.directory,
      prompt: 'Never finish.',
      signal: controller.signal,
      onEvent(event) {
        if (event.type === 'text-delta') {
          controller.abort()
        }
      }
    }),
    /Claude Code run was cancelled/
  )
})

test('Claude adapter rejects an already-aborted run before spawning', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    claudeCodeAgentAdapter.run({ cwd: tmpdir(), prompt: 'Do not run.', signal: controller.signal }),
    /cancelled/
  )
})
