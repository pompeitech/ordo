export type RuntimeMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface RuntimeMessage {
  readonly role: RuntimeMessageRole
  readonly content: string
  readonly toolCallId?: string
  readonly name?: string
  readonly toolCalls?: readonly ToolCall[]
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly mutating: boolean
}

export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: Readonly<Record<string, unknown>>
}

export interface RuntimeUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
  readonly cost?: number
  readonly currency?: string
}

export type ProviderStreamEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'tool-call'; readonly call: ToolCall }
  | { readonly type: 'usage'; readonly usage: RuntimeUsage }
  | { readonly type: 'done'; readonly finishReason?: string }

export interface ProviderRequest {
  readonly model: string
  readonly messages: readonly RuntimeMessage[]
  readonly tools: readonly ToolDefinition[]
  readonly maxOutputTokens?: number
  readonly signal?: AbortSignal
}

export interface ModelProvider {
  readonly id: string
  stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}

export interface ToolExecutionContext {
  readonly repositoryRoot: string
  readonly sessionId: string
  readonly call: ToolCall
}

export interface RuntimeTool extends ToolDefinition {
  preview?(context: ToolExecutionContext): Promise<unknown>
  execute(context: ToolExecutionContext): Promise<unknown>
}

export interface ApprovalRequest {
  readonly repositoryRoot: string
  readonly sessionId: string
  readonly tool: ToolDefinition
  readonly call: ToolCall
  readonly preview?: unknown
}

export type ApprovalDecision = 'allow-once' | 'allow-session' | 'deny'

export interface ApprovalPolicy {
  decide(request: ApprovalRequest): Promise<ApprovalDecision>
}

export interface RuntimeObserverEvent {
  readonly type:
    | 'turn-started'
    | 'text-delta'
    | 'tool-requested'
    | 'tool-completed'
    | 'approval'
    | 'usage'
    | 'turn-completed'
  readonly data: Readonly<Record<string, unknown>>
}

export type RuntimeObserver = (event: RuntimeObserverEvent) => void | Promise<void>

export interface RunSessionTurnOptions {
  readonly repositoryRoot: string
  readonly sessionId: string
  readonly provider: ModelProvider
  readonly model: string
  readonly prompt: string
  readonly systemPrompt?: string
  readonly contextPayload?: string
  readonly tools?: readonly RuntimeTool[]
  readonly approvalPolicy?: ApprovalPolicy
  readonly maxToolIterations?: number
  readonly maxOutputTokens?: number
  readonly signal?: AbortSignal
  readonly observe?: RuntimeObserver
}

export interface RunSessionTurnResult {
  readonly text: string
  readonly toolIterations: number
  readonly usage: RuntimeUsage
  readonly finishReason?: string
}
