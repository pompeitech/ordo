import type {
  ModelProvider,
  ProviderRequest,
  ProviderStreamEvent,
  RuntimeMessage,
  ToolCall
} from '@pompeitech/ordo-runtime'

export interface OpenAIResponsesProviderOptions {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly organization?: string
  readonly project?: string
  readonly fetch?: typeof globalThis.fetch
}

export interface OpenAICompatibleProviderOptions {
  readonly id: string
  readonly apiKey?: string
  readonly baseUrl: string
  readonly headers?: Readonly<Record<string, string>>
  readonly fetch?: typeof globalThis.fetch
}

interface SseEvent {
  readonly event?: string
  readonly data: string
}

function endpoint(baseUrl: string, pathname: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

async function errorResponse(response: Response): Promise<Error> {
  const body = await response.text()
  let message = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    message = parsed.error?.message ?? body
  } catch {
    // Preserve the response body when it is not JSON.
  }
  return new Error(
    `Provider request failed (${response.status}): ${message || response.statusText}`
  )
}

async function* parseSse(response: Response): AsyncGenerator<SseEvent> {
  if (!response.body) {
    throw new Error('Provider streaming response has no body')
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
      let event: string | undefined
      const data: string[] = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
        }
        if (line.startsWith('data:')) {
          data.push(line.slice(5).trimStart())
        }
      }
      if (data.length > 0) {
        yield { event, data: data.join('\n') }
      }
    }
    if (done) {
      break
    }
  }
  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data) {
      yield { data }
    }
  }
}

function parseArguments(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('arguments must be an object')
    }
    return Object.freeze({ ...(parsed as Record<string, unknown>) })
  } catch (error) {
    throw new Error(
      `Invalid provider tool arguments: ${error instanceof Error ? error.message : error}`
    )
  }
}

function responsesInput(messages: readonly RuntimeMessage[]): unknown[] {
  return messages.flatMap(message => {
    const items: unknown[] = []
    if (message.content) {
      items.push({
        role: message.role === 'tool' ? 'user' : message.role,
        content: message.content
      })
    }
    for (const call of message.toolCalls ?? []) {
      items.push({
        type: 'function_call',
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments)
      })
    }
    if (message.role === 'tool' && message.toolCallId) {
      return [
        { type: 'function_call_output', call_id: message.toolCallId, output: message.content }
      ]
    }
    return items
  })
}

function responseTools(request: ProviderRequest): unknown[] {
  return request.tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }))
}

export function createOpenAIResponsesProvider(
  options: OpenAIResponsesProviderOptions
): ModelProvider {
  if (!options.apiKey.trim()) {
    throw new Error('OpenAI API key must not be empty')
  }
  const fetcher = options.fetch ?? globalThis.fetch
  return {
    id: 'openai',
    async *stream(request): AsyncIterable<ProviderStreamEvent> {
      const response = await fetcher(
        endpoint(options.baseUrl ?? 'https://api.openai.com/v1', 'responses'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...authHeaders(options.apiKey),
            ...(options.organization ? { 'OpenAI-Organization': options.organization } : {}),
            ...(options.project ? { 'OpenAI-Project': options.project } : {})
          },
          body: JSON.stringify({
            model: request.model,
            input: responsesInput(request.messages),
            tools: responseTools(request),
            stream: true,
            max_output_tokens: request.maxOutputTokens
          }),
          signal: request.signal
        }
      )
      if (!response.ok) {
        throw await errorResponse(response)
      }
      const calls = new Map<string, { id: string; name: string; arguments: string }>()
      for await (const frame of parseSse(response)) {
        if (frame.data === '[DONE]') {
          continue
        }
        const event = JSON.parse(frame.data) as Record<string, unknown>
        const type = String(event.type ?? frame.event ?? '')
        if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
          yield { type: 'text-delta', text: event.delta }
        } else if (type === 'response.output_item.added') {
          const item = event.item as Record<string, unknown> | undefined
          if (item?.type === 'function_call') {
            const key = String(item.id ?? event.output_index)
            calls.set(key, {
              id: String(item.call_id ?? item.id),
              name: String(item.name ?? ''),
              arguments: typeof item.arguments === 'string' ? item.arguments : ''
            })
          }
        } else if (type === 'response.function_call_arguments.delta') {
          const key = String(event.item_id ?? event.output_index)
          const current = calls.get(key)
          if (current && typeof event.delta === 'string') {
            current.arguments += event.delta
          }
        } else if (type === 'response.function_call_arguments.done') {
          const key = String(event.item_id ?? event.output_index)
          const current = calls.get(key)
          const call: ToolCall = {
            id: String(event.call_id ?? current?.id ?? key),
            name: String(event.name ?? current?.name ?? ''),
            arguments: parseArguments(String(event.arguments ?? current?.arguments ?? '{}'))
          }
          calls.delete(key)
          yield { type: 'tool-call', call }
        } else if (type === 'response.completed') {
          const completed = event.response as Record<string, unknown> | undefined
          const rawUsage = completed?.usage as Record<string, unknown> | undefined
          if (rawUsage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: Number(rawUsage.input_tokens ?? 0),
                outputTokens: Number(rawUsage.output_tokens ?? 0),
                totalTokens: Number(rawUsage.total_tokens ?? 0)
              }
            }
          }
          yield { type: 'done', finishReason: String(completed?.status ?? 'completed') }
        } else if (type === 'response.failed' || type === 'error') {
          const error = (event.error ?? event.response) as Record<string, unknown> | undefined
          throw new Error(String(error?.message ?? 'OpenAI response failed'))
        }
      }
    }
  }
}

function chatMessages(messages: readonly RuntimeMessage[]): unknown[] {
  return messages.map(message => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
    }
    return {
      role: message.role,
      content: message.content || null,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map(call => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.arguments) }
            }))
          }
        : {})
    }
  })
}

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions
): ModelProvider {
  const fetcher = options.fetch ?? globalThis.fetch
  return {
    id: options.id,
    async *stream(request): AsyncIterable<ProviderStreamEvent> {
      const response = await fetcher(endpoint(options.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...authHeaders(options.apiKey),
          ...options.headers
        },
        body: JSON.stringify({
          model: request.model,
          messages: chatMessages(request.messages),
          tools: request.tools.map(tool => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema
            }
          })),
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: request.maxOutputTokens
        }),
        signal: request.signal
      })
      if (!response.ok) {
        throw await errorResponse(response)
      }
      const calls = new Map<number, { id: string; name: string; arguments: string }>()
      for await (const frame of parseSse(response)) {
        if (frame.data === '[DONE]') {
          yield { type: 'done' }
          continue
        }
        const chunk = JSON.parse(frame.data) as Record<string, unknown>
        const usage = chunk.usage as Record<string, unknown> | undefined
        if (usage) {
          yield {
            type: 'usage',
            usage: {
              inputTokens: Number(usage.prompt_tokens ?? 0),
              outputTokens: Number(usage.completion_tokens ?? 0),
              totalTokens: Number(usage.total_tokens ?? 0)
            }
          }
        }
        const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0]
        const delta = choice?.delta as Record<string, unknown> | undefined
        if (typeof delta?.content === 'string') {
          yield { type: 'text-delta', text: delta.content }
        }
        for (const raw of (delta?.tool_calls as Array<Record<string, unknown>> | undefined) ?? []) {
          const index = Number(raw.index)
          const current = calls.get(index) ?? { id: '', name: '', arguments: '' }
          const fn = raw.function as Record<string, unknown> | undefined
          if (typeof raw.id === 'string') {
            current.id = raw.id
          }
          if (typeof fn?.name === 'string') {
            current.name += fn.name
          }
          if (typeof fn?.arguments === 'string') {
            current.arguments += fn.arguments
          }
          calls.set(index, current)
        }
        if (choice?.finish_reason === 'tool_calls') {
          for (const current of [...calls.entries()]
            .sort(([left], [right]) => left - right)
            .map(([, value]) => value)) {
            yield {
              type: 'tool-call',
              call: {
                id: current.id,
                name: current.name,
                arguments: parseArguments(current.arguments || '{}')
              }
            }
          }
          calls.clear()
        }
        if (choice?.finish_reason && choice.finish_reason !== 'tool_calls') {
          yield { type: 'done', finishReason: String(choice.finish_reason) }
        }
      }
    }
  }
}
