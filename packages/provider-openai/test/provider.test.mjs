import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOpenAICompatibleProvider, createOpenAIResponsesProvider } from '../dist/index.js'

function sse(events) {
  const body = events
    .map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const request = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'Read the file' }],
  tools: [
    {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      mutating: false
    }
  ]
}

test('streams OpenAI Responses text, function calls, and usage', async () => {
  let sent
  const provider = createOpenAIResponsesProvider({
    apiKey: 'test-key',
    async fetch(url, init) {
      sent = { url, init, body: JSON.parse(init.body) }
      return sse([
        { type: 'response.output_text.delta', delta: 'Working' },
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: { id: 'item-1', type: 'function_call', call_id: 'call-1', name: 'read_file' }
        },
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'item-1',
          delta: '{"path":'
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'item-1',
          arguments: '{"path":"README.md"}'
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 }
          }
        }
      ])
    }
  })
  const events = []
  for await (const event of provider.stream(request)) {
    events.push(event)
  }

  assert.equal(sent.url, 'https://api.openai.com/v1/responses')
  assert.equal(sent.init.headers.Authorization, 'Bearer test-key')
  assert.equal(sent.body.tools[0].name, 'read_file')
  assert.deepEqual(events, [
    { type: 'text-delta', text: 'Working' },
    {
      type: 'tool-call',
      call: { id: 'call-1', name: 'read_file', arguments: { path: 'README.md' } }
    },
    { type: 'usage', usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } },
    { type: 'done', finishReason: 'completed' }
  ])
})

test('streams OpenAI-compatible chat completions and reconstructs tool arguments', async () => {
  let sent
  const provider = createOpenAICompatibleProvider({
    id: 'local',
    baseUrl: 'http://localhost:11434/v1',
    async fetch(url, init) {
      sent = { url, body: JSON.parse(init.body) }
      return sse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-2',
                    function: { name: 'read_file', arguments: '{"path":' }
                  }
                ]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"package.json"}' } }] },
              finish_reason: 'tool_calls'
            }
          ]
        },
        { choices: [], usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } },
        '[DONE]'
      ])
    }
  })
  const events = []
  for await (const event of provider.stream(request)) {
    events.push(event)
  }

  assert.equal(sent.url, 'http://localhost:11434/v1/chat/completions')
  assert.equal(sent.body.stream, true)
  assert.deepEqual(events[0], {
    type: 'tool-call',
    call: { id: 'call-2', name: 'read_file', arguments: { path: 'package.json' } }
  })
  assert.equal(events[1].usage.totalTokens, 10)
  assert.equal(events[2].type, 'done')
})

test('maps prior assistant tool calls and tool results on subsequent requests', async () => {
  let body
  const provider = createOpenAIResponsesProvider({
    apiKey: 'test-key',
    async fetch(_url, init) {
      body = JSON.parse(init.body)
      return sse([{ type: 'response.completed', response: { status: 'completed' } }])
    }
  })
  const messages = [
    { role: 'user', content: 'Read' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call-3', name: 'read_file', arguments: { path: 'README.md' } }]
    },
    { role: 'tool', name: 'read_file', toolCallId: 'call-3', content: '{"content":"hello"}' }
  ]
  for await (const _event of provider.stream({ ...request, messages })) {
    // consume
  }

  assert.deepEqual(body.input.slice(-2), [
    {
      type: 'function_call',
      call_id: 'call-3',
      name: 'read_file',
      arguments: '{"path":"README.md"}'
    },
    { type: 'function_call_output', call_id: 'call-3', output: '{"content":"hello"}' }
  ])
})
