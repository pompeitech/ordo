import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAnthropicProvider } from '../dist/index.js'

function sse(events) {
  return new Response(
    events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )
}

test('streams Anthropic text, tool use, and cumulative usage', async () => {
  let requestBody
  const provider = createAnthropicProvider({
    apiKey: 'test-key',
    async fetch(_url, init) {
      requestBody = JSON.parse(init.body)
      return sse([
        { type: 'message_start', message: { usage: { input_tokens: 20 } } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Checking' }
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'tool-1', name: 'read_file', input: {} }
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"path":"README.md"}' }
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 7 }
        },
        { type: 'message_stop' }
      ])
    }
  })
  const events = []
  for await (const event of provider.stream({
    model: 'claude-test',
    messages: [
      { role: 'system', content: 'Be careful.' },
      { role: 'user', content: 'Read it.' }
    ],
    tools: [
      {
        name: 'read_file',
        description: 'Read file',
        inputSchema: { type: 'object' },
        mutating: false
      }
    ]
  })) {
    events.push(event)
  }

  assert.equal(requestBody.system, 'Be careful.')
  assert.equal(requestBody.tools[0].input_schema.type, 'object')
  assert.deepEqual(events, [
    { type: 'text-delta', text: 'Checking' },
    {
      type: 'tool-call',
      call: { id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } }
    },
    { type: 'usage', usage: { inputTokens: 20, outputTokens: 7, totalTokens: 27 } },
    { type: 'done', finishReason: 'tool_use' }
  ])
})

test('maps tool history to Anthropic content blocks', async () => {
  let body
  const provider = createAnthropicProvider({
    apiKey: 'test-key',
    async fetch(_url, init) {
      body = JSON.parse(init.body)
      return sse([{ type: 'message_stop' }])
    }
  })
  const messages = [
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'tool-2', name: 'read_file', arguments: { path: 'a.ts' } }]
    },
    { role: 'tool', toolCallId: 'tool-2', name: 'read_file', content: 'result' }
  ]
  for await (const _event of provider.stream({ model: 'test', messages, tools: [] })) {
    // consume
  }
  assert.deepEqual(body.messages, [
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool-2', name: 'read_file', input: { path: 'a.ts' } }]
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'result', is_error: false }]
    }
  ])
})
