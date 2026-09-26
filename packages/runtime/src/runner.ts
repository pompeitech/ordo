import { appendSessionEvent, readSession } from '@pompeitech/ordo-core'
import type {
  ApprovalDecision,
  RunSessionTurnOptions,
  RunSessionTurnResult,
  RuntimeMessage,
  RuntimeObserverEvent,
  RuntimeTool,
  RuntimeUsage,
  ToolCall
} from './types.js'

const DEFAULT_MAX_TOOL_ITERATIONS = 24

function serialize(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function sessionMessages(
  events: Awaited<ReturnType<typeof readSession>>['events']
): RuntimeMessage[] {
  return events.flatMap(event => {
    if (event.type === 'message') {
      const role = event.data.role
      const content = event.data.content
      if (
        (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') &&
        typeof content === 'string'
      ) {
        return [
          {
            role,
            content,
            toolCallId:
              typeof event.data.toolCallId === 'string' ? event.data.toolCallId : undefined,
            name: typeof event.data.name === 'string' ? event.data.name : undefined,
            toolCalls: Array.isArray(event.data.toolCalls)
              ? (event.data.toolCalls as unknown as readonly ToolCall[])
              : undefined
          }
        ]
      }
    }
    return []
  })
}

async function notify(options: RunSessionTurnOptions, event: RuntimeObserverEvent): Promise<void> {
  await options.observe?.(Object.freeze(event))
}

async function recordMessage(
  options: RunSessionTurnOptions,
  message: RuntimeMessage
): Promise<void> {
  await appendSessionEvent(options.repositoryRoot, options.sessionId, {
    type: 'message',
    data: { ...message }
  })
}

function mergeUsage(current: RuntimeUsage, next: RuntimeUsage): RuntimeUsage {
  return Object.freeze({
    inputTokens: (current.inputTokens ?? 0) + (next.inputTokens ?? 0),
    outputTokens: (current.outputTokens ?? 0) + (next.outputTokens ?? 0),
    totalTokens: (current.totalTokens ?? 0) + (next.totalTokens ?? 0),
    cost:
      current.cost === undefined && next.cost === undefined
        ? undefined
        : (current.cost ?? 0) + (next.cost ?? 0),
    currency: next.currency ?? current.currency
  })
}

async function approvalFor(
  options: RunSessionTurnOptions,
  tool: RuntimeTool,
  call: ToolCall,
  sessionApprovals: Set<string>,
  preview?: unknown
): Promise<ApprovalDecision> {
  if (!tool.mutating || sessionApprovals.has(tool.name)) {
    return 'allow-once'
  }
  const decision = options.approvalPolicy
    ? await options.approvalPolicy.decide({
        repositoryRoot: options.repositoryRoot,
        sessionId: options.sessionId,
        tool,
        call,
        preview
      })
    : 'deny'
  if (decision === 'allow-session') {
    sessionApprovals.add(tool.name)
  }
  await appendSessionEvent(options.repositoryRoot, options.sessionId, {
    type: 'approval',
    data: { tool: tool.name, callId: call.id, decision, preview }
  })
  await notify(options, {
    type: 'approval',
    data: { tool: tool.name, callId: call.id, decision, preview }
  })
  return decision
}

function approvedToolsForSession(
  events: Awaited<ReturnType<typeof readSession>>['events']
): Set<string> {
  return new Set(
    events.flatMap(event =>
      event.type === 'approval' &&
      event.data.decision === 'allow-session' &&
      typeof event.data.tool === 'string'
        ? [event.data.tool]
        : []
    )
  )
}

function previewDiff(preview: unknown): string | undefined {
  if (
    preview &&
    typeof preview === 'object' &&
    'diff' in preview &&
    typeof preview.diff === 'string'
  ) {
    return preview.diff
  }
  return undefined
}

export async function runSessionTurn(
  options: RunSessionTurnOptions
): Promise<RunSessionTurnResult> {
  const prompt = options.prompt.trim()
  if (!prompt) {
    throw new Error('Session prompt must not be empty')
  }
  const maxToolIterations = options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS
  if (
    !Number.isSafeInteger(maxToolIterations) ||
    maxToolIterations < 0 ||
    maxToolIterations > 128
  ) {
    throw new Error('maxToolIterations must be an integer between 0 and 128')
  }

  const detail = await readSession(options.repositoryRoot, options.sessionId)
  const tools = options.tools ?? []
  const toolMap = new Map(tools.map(tool => [tool.name, tool]))
  const sessionApprovals = approvedToolsForSession(detail.events)
  const messages: RuntimeMessage[] = []
  if (options.systemPrompt || options.contextPayload) {
    messages.push({
      role: 'system',
      content: [options.systemPrompt, options.contextPayload].filter(Boolean).join('\n\n')
    })
  }
  messages.push(...sessionMessages(detail.events), { role: 'user', content: prompt })
  await recordMessage(options, { role: 'user', content: prompt })
  await notify(options, { type: 'turn-started', data: { sessionId: options.sessionId } })

  let combinedText = ''
  let toolIterations = 0
  let usage: RuntimeUsage = Object.freeze({})
  let finishReason: string | undefined

  while (true) {
    let responseText = ''
    const toolCalls: ToolCall[] = []
    for await (const event of options.provider.stream({
      model: options.model,
      messages,
      tools,
      maxOutputTokens: options.maxOutputTokens,
      signal: options.signal
    })) {
      if (event.type === 'text-delta') {
        responseText += event.text
        combinedText += event.text
        await notify(options, { type: 'text-delta', data: { text: event.text } })
      } else if (event.type === 'tool-call') {
        toolCalls.push(event.call)
        await notify(options, { type: 'tool-requested', data: { call: event.call } })
      } else if (event.type === 'usage') {
        usage = mergeUsage(usage, event.usage)
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'usage',
          data: { ...event.usage }
        })
        await notify(options, { type: 'usage', data: { ...event.usage } })
      } else if (event.type === 'done') {
        finishReason = event.finishReason
      }
    }

    if (responseText || toolCalls.length > 0) {
      const assistantMessage: RuntimeMessage = {
        role: 'assistant',
        content: responseText,
        toolCalls: toolCalls.length > 0 ? Object.freeze([...toolCalls]) : undefined
      }
      messages.push(assistantMessage)
      await recordMessage(options, assistantMessage)
    }
    if (toolCalls.length === 0) {
      break
    }
    toolIterations += 1
    if (toolIterations > maxToolIterations) {
      throw new Error(`Tool iteration limit exceeded: ${maxToolIterations}`)
    }

    for (const call of toolCalls) {
      const tool = toolMap.get(call.name)
      if (!tool) {
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-call',
          data: { id: call.id, name: call.name, arguments: call.arguments }
        })
        const error = `Unknown tool: ${call.name}`
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: error })
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-result',
          data: { callId: call.id, tool: call.name, ok: false, error }
        })
        continue
      }

      let preview: unknown
      try {
        preview = await tool.preview?.({
          repositoryRoot: options.repositoryRoot,
          sessionId: options.sessionId,
          call
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-call',
          data: { id: call.id, name: call.name, arguments: call.arguments }
        })
        messages.push({ role: 'tool', name: tool.name, toolCallId: call.id, content: message })
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-result',
          data: { callId: call.id, tool: tool.name, ok: false, error: message }
        })
        continue
      }
      await appendSessionEvent(options.repositoryRoot, options.sessionId, {
        type: 'tool-call',
        data: { id: call.id, name: call.name, arguments: call.arguments, preview }
      })
      const diff = previewDiff(preview)
      if (diff) {
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'diff',
          data: { callId: call.id, tool: tool.name, diff, applied: false }
        })
      }

      const decision = await approvalFor(options, tool, call, sessionApprovals, preview)
      if (decision === 'deny') {
        const error = `Tool denied: ${tool.name}`
        messages.push({ role: 'tool', name: tool.name, toolCallId: call.id, content: error })
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-result',
          data: { callId: call.id, tool: tool.name, ok: false, denied: true }
        })
        continue
      }

      try {
        const value = await tool.execute({
          repositoryRoot: options.repositoryRoot,
          sessionId: options.sessionId,
          call
        })
        const content = serialize(value)
        messages.push({ role: 'tool', name: tool.name, toolCallId: call.id, content })
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-result',
          data: { callId: call.id, tool: tool.name, ok: true, value }
        })
        if (diff) {
          await appendSessionEvent(options.repositoryRoot, options.sessionId, {
            type: 'diff',
            data: { callId: call.id, tool: tool.name, diff, applied: true }
          })
        }
        await notify(options, {
          type: 'tool-completed',
          data: { callId: call.id, tool: tool.name, ok: true }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        messages.push({ role: 'tool', name: tool.name, toolCallId: call.id, content: message })
        await appendSessionEvent(options.repositoryRoot, options.sessionId, {
          type: 'tool-result',
          data: { callId: call.id, tool: tool.name, ok: false, error: message }
        })
        await notify(options, {
          type: 'tool-completed',
          data: { callId: call.id, tool: tool.name, ok: false }
        })
      }
    }
  }

  await notify(options, {
    type: 'turn-completed',
    data: { text: combinedText, toolIterations, finishReason }
  })
  return Object.freeze({ text: combinedText, toolIterations, usage, finishReason })
}
