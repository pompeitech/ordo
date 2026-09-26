import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createSession, readSession } from '@pompeitech/ordo-core'
import { runSessionTurn } from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-runtime-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, '.git'))
  await writeFile(path.join(directory, 'package.json'), '{"name":"runtime-fixture"}\n')
  return directory
}

test('runs a streamed provider turn with approved tools and complete audit events', async () => {
  const repository = await createRepository()
  const session = await createSession(repository, {
    title: 'Runtime test',
    runtime: { provider: 'fake', model: 'fake-model' }
  })
  let providerCalls = 0
  let toolCalls = 0
  const observed = []
  const provider = {
    id: 'fake',
    async *stream(request) {
      providerCalls += 1
      if (providerCalls === 1) {
        assert.match(request.messages[0].content, /project context/)
        yield {
          type: 'tool-call',
          call: { id: 'call-1', name: 'write_file', arguments: { path: 'result.txt' } }
        }
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } }
        yield { type: 'done', finishReason: 'tool_calls' }
        return
      }
      assert.equal(request.messages.at(-1).role, 'tool')
      yield { type: 'text-delta', text: 'Completed.' }
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } }
      yield { type: 'done', finishReason: 'stop' }
    }
  }
  const result = await runSessionTurn({
    repositoryRoot: repository,
    sessionId: session.id,
    provider,
    model: 'fake-model',
    prompt: 'Create the result.',
    contextPayload: 'project context',
    tools: [
      {
        name: 'write_file',
        description: 'Write a repository file',
        inputSchema: { type: 'object' },
        mutating: true,
        async execute() {
          toolCalls += 1
          return { written: 'result.txt' }
        }
      }
    ],
    approvalPolicy: {
      async decide() {
        return 'allow-session'
      }
    },
    observe(event) {
      observed.push(event.type)
    }
  })
  const detail = await readSession(repository, session.id)

  assert.equal(result.text, 'Completed.')
  assert.equal(result.toolIterations, 1)
  assert.equal(result.usage.totalTokens, 20)
  assert.equal(providerCalls, 2)
  assert.equal(toolCalls, 1)
  assert.deepEqual(
    detail.events.map(event => event.type),
    ['message', 'usage', 'message', 'tool-call', 'approval', 'tool-result', 'usage', 'message']
  )
  assert.ok(observed.includes('tool-requested'))
  assert.ok(observed.includes('turn-completed'))
})

test('denies mutating tools by default while allowing the provider to recover', async () => {
  const repository = await createRepository()
  const session = await createSession(repository, { title: 'Deny test' })
  let providerCalls = 0
  let executed = false
  const provider = {
    id: 'fake',
    async *stream() {
      providerCalls += 1
      if (providerCalls === 1) {
        yield {
          type: 'tool-call',
          call: { id: 'call-1', name: 'dangerous', arguments: {} }
        }
        return
      }
      yield { type: 'text-delta', text: 'The operation was denied.' }
      yield { type: 'done', finishReason: 'stop' }
    }
  }
  const result = await runSessionTurn({
    repositoryRoot: repository,
    sessionId: session.id,
    provider,
    model: 'fake-model',
    prompt: 'Run it.',
    tools: [
      {
        name: 'dangerous',
        description: 'Mutate state',
        inputSchema: {},
        mutating: true,
        async execute() {
          executed = true
        }
      }
    ]
  })

  assert.equal(executed, false)
  assert.equal(result.text, 'The operation was denied.')
})

test('passes a tool preview into approval and preserves session approval across turns', async () => {
  const repository = await createRepository()
  const session = await createSession(repository, { title: 'Persistent approval test' })
  let approvals = 0
  let executions = 0
  const tool = {
    name: 'write_file',
    description: 'Write a file',
    inputSchema: { type: 'object' },
    mutating: true,
    async preview() {
      return { diff: '--- a/file\n+++ b/file' }
    },
    async execute() {
      executions += 1
      return { ok: true }
    }
  }
  const approvalPolicy = {
    async decide(request) {
      approvals += 1
      assert.match(request.preview.diff, /^---/)
      return 'allow-session'
    }
  }
  function provider(callId) {
    let calls = 0
    return {
      id: 'fake',
      async *stream() {
        calls += 1
        if (calls === 1) {
          yield {
            type: 'tool-call',
            call: { id: callId, name: 'write_file', arguments: { path: 'file' } }
          }
          return
        }
        yield { type: 'text-delta', text: 'done' }
      }
    }
  }

  await runSessionTurn({
    repositoryRoot: repository,
    sessionId: session.id,
    provider: provider('first'),
    model: 'fake-model',
    prompt: 'First turn',
    tools: [tool],
    approvalPolicy
  })
  await runSessionTurn({
    repositoryRoot: repository,
    sessionId: session.id,
    provider: provider('second'),
    model: 'fake-model',
    prompt: 'Second turn',
    tools: [tool],
    approvalPolicy
  })

  const detail = await readSession(repository, session.id)
  assert.equal(approvals, 1)
  assert.equal(executions, 2)
  assert.equal(detail.events.filter(event => event.type === 'diff').length, 4)
  assert.equal(
    detail.events.filter(
      event => event.type === 'approval' && event.data.decision === 'allow-session'
    ).length,
    1
  )
})
