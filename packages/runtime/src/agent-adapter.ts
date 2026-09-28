import type { AgentUsage } from './usage.js'

export type AgentAdapterId = 'claude-code' | 'codex'
export type AgentCapability =
  | 'streaming'
  | 'usage'
  | 'cancellation'
  | 'resume'
  | 'approval-requests'

export type AgentAccess = 'read-only' | 'workspace'

export type AgentCapabilities = Readonly<Record<AgentCapability, boolean>>

export interface AgentApprovalRequest {
  readonly id: string
  readonly kind: 'command-execution' | 'file-change' | 'permission-escalation'
  readonly summary: string
  readonly command?: string
  readonly cwd?: string
  readonly reason?: string
  readonly details: Readonly<Record<string, unknown>>
}

/** Decisions are intentionally per-request; session-wide grants are not exposed. */
export type AgentApprovalDecision = 'accept' | 'decline'

export type AgentEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'native-session'; readonly nativeSessionId: string }
  | {
      readonly type: 'tool-call'
      readonly id: string
      readonly name: string
      readonly input: unknown
    }
  | {
      readonly type: 'approval-request'
      readonly id: string
      readonly name: string
      readonly input: unknown
    }
  | {
      readonly type: 'approval-decision'
      readonly id: string
      readonly decision: AgentApprovalDecision
    }
  | { readonly type: 'usage'; readonly inputTokens?: number; readonly outputTokens?: number }
  /** Plan limits the harness reported during the run; personal, never stored in `.ordo/`. */
  | { readonly type: 'usage-limits'; readonly usage: AgentUsage }
  | { readonly type: 'result'; readonly text: string; readonly nativeSessionId?: string }

export interface AgentInstallation {
  readonly id: AgentAdapterId
  readonly command: string
  readonly version: string
  readonly capabilities: AgentCapabilities
}

export interface AgentRunOptions {
  readonly command?: string
  readonly cwd: string
  /**
   * The user's API key for harnesses that accept one per process (Claude Code). Codex
   * ignores it: its API key login is stored by Codex itself via `loginCodexWithApiKey`.
   */
  readonly apiKey?: string
  readonly prompt: string
  /** Continues an earlier conversation of this harness: Claude session ID or Codex thread ID. */
  readonly resume?: string
  /**
   * `read-only` lets the agent read the project but never write files or run commands:
   * Claude Code gets only its read tools, Codex runs in its read-only sandbox.
   */
  readonly access?: AgentAccess
  readonly signal?: AbortSignal
  readonly onEvent?: (event: AgentEvent) => void | Promise<void>
  readonly onApprovalRequest?: (
    request: AgentApprovalRequest
  ) => AgentApprovalDecision | Promise<AgentApprovalDecision>
}

export interface AgentRunResult {
  readonly text: string
  readonly nativeSessionId?: string
  readonly exitCode: number
}

export interface AgentAdapter {
  readonly id: AgentAdapterId
  detect(options: { readonly command?: string; readonly cwd: string }): Promise<AgentInstallation>
  run(options: AgentRunOptions): Promise<AgentRunResult>
}

export class AgentAdapterRegistry {
  readonly #adapters = new Map<AgentAdapterId, AgentAdapter>()

  constructor(adapters: readonly AgentAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter)
    }
  }

  register(adapter: AgentAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new AgentAdapterError(
        'AGENT_ADAPTER_DUPLICATE',
        `Agent adapter already registered: ${adapter.id}`
      )
    }
    this.#adapters.set(adapter.id, adapter)
  }

  has(id: AgentAdapterId): boolean {
    return this.#adapters.has(id)
  }

  get(id: AgentAdapterId): AgentAdapter {
    const adapter = this.#adapters.get(id)
    if (!adapter) {
      throw new AgentAdapterError(
        'AGENT_ADAPTER_NOT_FOUND',
        `Agent adapter is not registered: ${id}`
      )
    }
    return adapter
  }

  list(): readonly AgentAdapter[] {
    return Object.freeze(
      [...this.#adapters.values()].sort((left, right) => left.id.localeCompare(right.id))
    )
  }
}

export function createAgentAdapterRegistry(
  adapters: readonly AgentAdapter[]
): AgentAdapterRegistry {
  return new AgentAdapterRegistry(adapters)
}

export class AgentAdapterError extends Error {
  readonly code: 'AGENT_ADAPTER_DUPLICATE' | 'AGENT_ADAPTER_NOT_FOUND'

  constructor(code: AgentAdapterError['code'], message: string) {
    super(message)
    this.name = 'AgentAdapterError'
    this.code = code
  }
}
