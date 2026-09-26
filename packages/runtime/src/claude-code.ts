import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentInstallation,
  AgentRunOptions
} from './agent-adapter.js'
import { claudeUsageFromRateLimitEvent } from './usage.js'

export interface ClaudeCodeInstallation extends AgentInstallation {
  readonly id: 'claude-code'
}

export type ClaudeCodeEvent = AgentEvent

export const claudeCodeCapabilities: AgentCapabilities = Object.freeze({
  streaming: true,
  usage: true,
  cancellation: true,
  resume: false,
  'approval-requests': false
})

export interface ClaudeCodeRunOptions {
  readonly command?: string
  readonly cwd: string
  /** The user's Anthropic API key; pass it only when Claude Code is not logged in. */
  readonly apiKey?: string
  readonly prompt: string
  readonly signal?: AbortSignal
  readonly onEvent?: (event: ClaudeCodeEvent) => void | Promise<void>
}

export interface ClaudeCodeRunResult {
  readonly text: string
  readonly sessionId?: string
  readonly exitCode: number
}

/**
 * Environment for a Claude Code process that authenticates with the user's API key.
 * Without a key the process inherits the environment and uses the CLI's own login.
 */
export function claudeCodeEnvironment(apiKey?: string): NodeJS.ProcessEnv | undefined {
  const key = apiKey?.trim()
  return key ? { ...process.env, ANTHROPIC_API_KEY: key } : undefined
}

function spawnCapture(command: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', code => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${String(code)}`))
      }
    })
  })
}

export async function detectClaudeCode(options: {
  readonly command?: string
  readonly cwd: string
}): Promise<ClaudeCodeInstallation> {
  const command = options.command ?? 'claude'
  const version = await spawnCapture(command, ['--version'], options.cwd)
  if (!version) {
    throw new Error('Claude Code returned an empty version string')
  }
  return Object.freeze({
    id: 'claude-code',
    command,
    version,
    capabilities: claudeCodeCapabilities
  })
}

function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

async function emit(
  callback: ClaudeCodeRunOptions['onEvent'],
  event: ClaudeCodeEvent
): Promise<void> {
  await callback?.(Object.freeze(event))
}

/** Run Claude Code through its installed CLI. Never uses a shell or reads credentials. */
export async function runClaudeCode(options: ClaudeCodeRunOptions): Promise<ClaudeCodeRunResult> {
  if (!options.prompt.trim()) {
    throw new Error('Claude Code prompt cannot be empty')
  }
  if (options.signal?.aborted) {
    throw new Error('Claude Code run was cancelled')
  }

  const command = options.command ?? 'claude'
  const child = spawn(
    command,
    ['-p', '--output-format', 'stream-json', '--verbose', options.prompt],
    {
      cwd: options.cwd,
      env: claudeCodeEnvironment(options.apiKey),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  const closed = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve(code ?? 1))
  })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  let text = ''
  let sessionId: string | undefined
  let finalText: string | undefined
  let terminationRequested = false
  let forceKillTimer: NodeJS.Timeout | undefined
  const terminate = () => {
    if (terminationRequested || !isAlive(child)) {
      return
    }
    terminationRequested = true
    child.kill('SIGTERM')
    forceKillTimer = setTimeout(() => {
      if (isAlive(child)) {
        child.kill('SIGKILL')
      }
    }, 2_000)
    forceKillTimer.unref()
  }
  const onAbort = () => terminate()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) {
    onAbort()
  }

  try {
    for await (const line of lines) {
      if (!line.trim()) {
        continue
      }
      let message: Record<string, unknown>
      try {
        message = JSON.parse(line) as Record<string, unknown>
      } catch {
        throw new Error('Claude Code emitted invalid stream-json output')
      }
      if (typeof message.session_id === 'string' && message.session_id !== sessionId) {
        sessionId = message.session_id
        await emit(options.onEvent, { type: 'native-session', nativeSessionId: sessionId })
      }
      if (message.type === 'stream_event') {
        const event = recordFromUnknown(message.event)
        const delta = recordFromUnknown(event?.delta)
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          text += delta.text
          await emit(options.onEvent, { type: 'text-delta', text: delta.text })
        }
      } else if (message.type === 'rate_limit_event') {
        const usage = claudeUsageFromRateLimitEvent(message)
        if (usage) {
          await emit(options.onEvent, { type: 'usage-limits', usage })
        }
      } else if (message.type === 'result') {
        if (typeof message.result === 'string') {
          finalText = message.result
        }
        const usage = recordFromUnknown(message.usage)
        if (usage) {
          await emit(options.onEvent, {
            type: 'usage',
            inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
            outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined
          })
        }
      }
    }
    const exitCode = await closed
    if (options.signal?.aborted) {
      throw new Error('Claude Code run was cancelled')
    }
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `Claude Code exited with code ${exitCode}`)
    }
    const resultText = finalText ?? text
    await emit(options.onEvent, { type: 'result', text: resultText, nativeSessionId: sessionId })
    return Object.freeze({ text: resultText, sessionId, exitCode })
  } catch (error) {
    terminate()
    await closed.catch(() => undefined)
    if (options.signal?.aborted) {
      throw new Error('Claude Code run was cancelled')
    }
    throw error
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    if (forceKillTimer) {
      clearTimeout(forceKillTimer)
    }
  }
}

export const claudeCodeAgentAdapter: AgentAdapter = Object.freeze({
  id: 'claude-code',
  async detect(options: Parameters<AgentAdapter['detect']>[0]) {
    return detectClaudeCode(options)
  },
  async run(options: AgentRunOptions) {
    const result = await runClaudeCode(options)
    return Object.freeze({
      text: result.text,
      nativeSessionId: result.sessionId,
      exitCode: result.exitCode
    })
  }
})
