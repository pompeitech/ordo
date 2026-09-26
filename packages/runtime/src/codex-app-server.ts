import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type {
  AgentAdapter,
  AgentApprovalDecision,
  AgentApprovalRequest,
  AgentCapabilities,
  AgentEvent,
  AgentInstallation,
  AgentRunOptions
} from './agent-adapter.js'
import { codexUsageFromRateLimits } from './usage.js'

export interface CodexInstallation extends AgentInstallation {
  readonly id: 'codex'
}

export const codexCapabilities: AgentCapabilities = Object.freeze({
  streaming: true,
  usage: false,
  cancellation: true,
  resume: false,
  'approval-requests': true
})

function capture(command: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk))
    child.once('error', reject)
    child.once('close', code =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(stderr.trim() || `${command} exited with code ${String(code)}`))
    )
  })
}

export async function detectCodex(options: {
  readonly command?: string
  readonly cwd: string
}): Promise<CodexInstallation> {
  const command = options.command ?? 'codex'
  const version = await capture(command, ['--version'], options.cwd)
  if (!version) {
    throw new Error('Codex returned an empty version string')
  }
  return Object.freeze({ id: 'codex', command, version, capabilities: codexCapabilities })
}

type RpcMessage = {
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: string }
}
type Deferred = { resolve(value: unknown): void; reject(error: Error): void }
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined

/** Codex's local, authenticated app-server JSON-RPC interface. */
export async function runCodex(options: AgentRunOptions): Promise<{
  readonly text: string
  readonly nativeSessionId?: string
  readonly exitCode: number
}> {
  if (!options.prompt.trim()) {
    throw new Error('Codex prompt cannot be empty')
  }
  if (options.signal?.aborted) {
    throw new Error('Codex run was cancelled')
  }
  const command = options.command ?? 'codex'
  const child = spawn(command, ['app-server'], {
    cwd: options.cwd,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk))
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const pending = new Map<string | number, Deferred>()
  let nextId = 0
  let threadId: string | undefined
  let turnId: string | undefined
  let turnStatus: string | undefined
  let text = ''
  let finalText: string | undefined
  let protocolError: Error | undefined
  let resolveTurn: (() => void) | undefined
  let rejectTurn: ((error: Error) => void) | undefined
  const turnDone = new Promise<void>((resolve, reject) => {
    resolveTurn = resolve
    rejectTurn = reject
  })
  void turnDone.catch(() => undefined)
  const closed = new Promise<number>(resolve => child.once('close', code => resolve(code ?? 1)))
  const send = (message: unknown) => {
    if (!child.stdin.writable) {
      throw new Error('Codex app-server stdin is closed')
    }
    child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  const request = (method: string, params: unknown): Promise<unknown> => {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try {
        send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        pending.delete(id)
        reject(error)
      }
    })
  }
  const onAbort = () => {
    if (threadId && turnId) {
      void request('turn/interrupt', { threadId, turnId }).catch(() => undefined)
    } else {
      child.kill('SIGTERM')
    }
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const reader = (async () => {
    try {
      for await (const line of lines) {
        if (!line.trim()) {
          continue
        }
        let message: RpcMessage
        try {
          message = JSON.parse(line) as RpcMessage
        } catch {
          throw new Error('Codex app-server emitted invalid JSON-RPC output')
        }
        if (message.id !== undefined && (message.result !== undefined || message.error)) {
          const deferred = pending.get(message.id)
          if (deferred) {
            pending.delete(message.id)
            if (message.error) {
              deferred.reject(new Error(message.error.message ?? 'Codex app-server request failed'))
            } else {
              deferred.resolve(message.result)
            }
          }
          continue
        }
        if (message.method === 'account/rateLimits/updated') {
          const usage = codexUsageFromRateLimits(message.params, 'last-run')
          if (usage) {
            await options.onEvent?.(Object.freeze({ type: 'usage-limits', usage }))
          }
          continue
        }
        if (message.method === 'item/agentMessage/delta') {
          const params = record(message.params)
          if (typeof params?.delta === 'string') {
            text += params.delta
            await options.onEvent?.(Object.freeze({ type: 'text-delta', text: params.delta }))
          }
        } else if (message.method === 'item/completed') {
          const item = record(message.params)?.item
          const root = record(item)?.root
          if (record(root)?.type === 'agentMessage' && typeof record(root)?.text === 'string') {
            finalText = record(root)?.text as string
          }
        } else if (message.method === 'turn/completed') {
          const params = record(message.params)
          const turn = record(params?.turn)
          const id = typeof turn?.id === 'string' ? turn.id : undefined
          if (typeof turn?.status === 'string') {
            turnStatus = turn.status
          }
          if (!turnId || !id || id === turnId) {
            resolveTurn?.()
          }
        } else if (message.method && message.id !== undefined) {
          const params = record(message.params) ?? {}
          const approvalKind =
            message.method === 'item/commandExecution/requestApproval'
              ? 'command-execution'
              : message.method === 'item/fileChange/requestApproval'
                ? 'file-change'
                : message.method === 'item/permissions/requestApproval'
                  ? 'permission-escalation'
                  : undefined
          if (approvalKind) {
            const request: AgentApprovalRequest = Object.freeze({
              id: String(message.id),
              kind: approvalKind,
              summary:
                approvalKind === 'command-execution'
                  ? 'Codex requests permission to execute a command'
                  : approvalKind === 'file-change'
                    ? 'Codex requests permission to change files'
                    : 'Codex requests additional sandbox permissions',
              command: typeof params.command === 'string' ? params.command : undefined,
              cwd: typeof params.cwd === 'string' ? params.cwd : undefined,
              reason: typeof params.reason === 'string' ? params.reason : undefined,
              details: Object.freeze({ ...params })
            })
            await options.onEvent?.(
              Object.freeze({
                type: 'approval-request',
                id: request.id,
                name: request.summary,
                input: request
              })
            )
            let decision: AgentApprovalDecision = 'decline'
            try {
              decision = (await options.onApprovalRequest?.(request)) ?? 'decline'
            } catch {
              // An absent or failed approval UI must never turn into implicit consent.
              decision = 'decline'
            }
            await options.onEvent?.(
              Object.freeze({ type: 'approval-decision', id: request.id, decision })
            )
            const response =
              approvalKind === 'permission-escalation'
                ? {
                    permissions: decision === 'accept' ? (params.permissions ?? {}) : {},
                    scope: 'turn'
                  }
                : { decision }
            send({ method: message.method, id: message.id, response })
          } else {
            // Unknown request types have no safe typed response: stop the turn rather than guess.
            throw new Error(`Unsupported Codex app-server server request: ${message.method}`)
          }
        }
      }
      const closeError = new Error(
        stderr.trim() || 'Codex app-server closed before replying to a request'
      )
      for (const deferred of pending.values()) {
        deferred.reject(closeError)
      }
      pending.clear()
      rejectTurn?.(closeError)
    } catch (error) {
      protocolError = error instanceof Error ? error : new Error(String(error))
      for (const deferred of pending.values()) {
        deferred.reject(protocolError)
      }
      pending.clear()
      rejectTurn?.(protocolError)
    }
  })()

  try {
    await request('initialize', { clientInfo: { name: 'ordo', title: 'Ordo', version: '1.0.1' } })
    send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    const started = record(await request('thread/start', { cwd: options.cwd }))
    const thread = record(started?.thread)
    threadId = typeof thread?.id === 'string' ? thread.id : undefined
    if (!threadId) {
      throw new Error('Codex app-server did not return a thread ID')
    }
    await options.onEvent?.(Object.freeze({ type: 'native-session', nativeSessionId: threadId }))
    const startedTurn = record(
      await request('turn/start', { threadId, input: [{ type: 'text', text: options.prompt }] })
    )
    const turn = record(startedTurn?.turn)
    turnId = typeof turn?.id === 'string' ? turn.id : undefined
    if (!turnId) {
      throw new Error('Codex app-server did not return a turn ID')
    }
    if (options.signal?.aborted) {
      onAbort()
    }
    await Promise.race([
      turnDone,
      closed.then(code => {
        if (code !== 0) {
          throw new Error(stderr.trim() || `Codex app-server exited with code ${code}`)
        }
        throw new Error('Codex app-server closed before the turn completed')
      })
    ])
    if (options.signal?.aborted) {
      throw new Error('Codex run was cancelled')
    }
    if (turnStatus && turnStatus !== 'completed') {
      throw new Error(`Codex turn ended with status: ${turnStatus}`)
    }
    if (protocolError) {
      throw protocolError
    }
    const resultText = finalText ?? text
    await options.onEvent?.(
      Object.freeze({ type: 'result', text: resultText, nativeSessionId: threadId })
    )
    return Object.freeze({ text: resultText, nativeSessionId: threadId, exitCode: 0 })
  } catch (error) {
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 2_000)
    timer.unref()
    await closed
    if (options.signal?.aborted) {
      throw new Error('Codex run was cancelled')
    }
    throw error
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    child.stdin.end()
    child.kill('SIGTERM')
    const shutdownTimer = setTimeout(() => child.kill('SIGKILL'), 2_000)
    shutdownTimer.unref()
    await Promise.race([reader, closed])
    clearTimeout(shutdownTimer)
  }
}

export const codexAgentAdapter: AgentAdapter = Object.freeze({
  id: 'codex',
  detect: detectCodex,
  run: runCodex
})
