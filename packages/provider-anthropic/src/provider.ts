import type {
  ModelProvider,
  ProviderRequest,
  ProviderStreamEvent,
  RuntimeMessage
} from '@pompeitech/ordo-runtime'

export interface AnthropicProviderOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly apiVersion?: string
  readonly fetch?: typeof globalThis.fetch
}

async function* parseSse(response: Response): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) {
    throw new Error('Anthropic streaming response has no body')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n')
      if (data) {
        yield JSON.parse(data) as Record<string, unknown>
      }
    }
    if (done) {
      break
    }
  }
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.text()
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return new Error(
      `Anthropic request failed (${response.status}): ${parsed.error?.message ?? response.statusText}`
    )
  } catch {
    return new Error(
      `Anthropic request failed (${response.status}): ${body || response.statusText}`
    )
  }
}

function messageContent(message: RuntimeMessage): unknown {
  if (message.role === 'tool') {
    return [
      {
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: message.content,
        is_error: false
      }
    ]
  }
  const blocks: unknown[] = []
  if (message.content) {
    blocks.push({ type: 'text', text: message.content })
  }
  for (const call of message.toolCalls ?? []) {
    blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments })
  }
  return blocks.length === 1 && message.toolCalls === undefined ? message.content : blocks
}

function anthropicMessages(messages: readonly RuntimeMessage[]): unknown[] {
  return messages
    .filter(message => message.role !== 'system')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: messageContent(message)
    }))
}

function systemPrompt(messages: readonly RuntimeMessage[]): string | undefined {
  const content = messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .filter(Boolean)
    .join('\n\n')
  return content || undefined
}

function parseArguments(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return Object.freeze({ ...(parsed as Record<string, unknown>) })
  } catch (error) {
    throw new Error(
      `Invalid Anthropic tool input: ${error instanceof Error ? error.message : error}`
    )
  }
}

export function createAnthropicProvider(options: AnthropicProviderOptions): ModelProvider {
  if (!options.apiKey.trim()) {
    throw new Error('Anthropic API key must not be empty')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  const baseUrl = options.baseUrl?.replace(/\/$/, '') ?? 'https://api.anthropic.com/v1'
  return {
    id: 'anthropic',
    async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const response = await fetcher(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'x-api-key': options.apiKey,
          'anthropic-version': options.apiVersion ?? '2023-06-01'
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 4096,
          system: systemPrompt(request.messages),
          messages: anthropicMessages(request.messages),
          tools: request.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema
          })),
          stream: true
        }),
        signal: request.signal
      })
      if (!response.ok) {
        throw await responseError(response)
      }
      const toolBlocks = new Map<number, { id: string; name: string; input: string }>()
      let inputTokens = 0
      let outputTokens = 0
      let finishReason: string | undefined
      for await (const event of parseSse(response)) {
        const type = String(event.type ?? '')
        if (type === 'message_start') {
          const message = event.message as Record<string, unknown> | undefined
          const usage = message?.usage as Record<string, unknown> | undefined
          inputTokens = Number(usage?.input_tokens ?? 0)
        } else if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown> | undefined
          if (block?.type === 'tool_use') {
            toolBlocks.set(Number(event.index), {
              id: String(block.id),
              name: String(block.name),
              input: ''
            })
          }
        } else if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            yield { type: 'text-delta', text: delta.text }
          } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            const block = toolBlocks.get(Number(event.index))
            if (block) {
              block.input += delta.partial_json
            }
          }
        } else if (type === 'content_block_stop') {
          const block = toolBlocks.get(Number(event.index))
          if (block) {
            toolBlocks.delete(Number(event.index))
            yield {
              type: 'tool-call',
              call: { id: block.id, name: block.name, arguments: parseArguments(block.input) }
            }
          }
        } else if (type === 'message_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          const usage = event.usage as Record<string, unknown> | undefined
          outputTokens = Number(usage?.output_tokens ?? outputTokens)
          if (typeof delta?.stop_reason === 'string') {
            finishReason = delta.stop_reason
          }
        } else if (type === 'message_stop') {
          yield {
            type: 'usage',
            usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
          }
          yield { type: 'done', finishReason }
        } else if (type === 'error') {
          const error = event.error as Record<string, unknown> | undefined
          throw new Error(String(error?.message ?? 'Anthropic stream failed'))
        }
      }
    }
  }
}
