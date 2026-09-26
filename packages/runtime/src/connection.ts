import { spawn } from 'node:child_process'
import type { AgentAdapterId, AgentInstallation } from './agent-adapter.js'
import { claudeCodeEnvironment, detectClaudeCode } from './claude-code.js'
import { detectCodex } from './codex-app-server.js'

export type AgentConnectionStatus = 'not-found' | 'not-authenticated' | 'connected'

/**
 * Connection state of a locally installed harness. Credentials stay owned by the
 * harness CLI: Ordo only reads its status command and keeps the auth method, never
 * account identifiers, tokens or keys. `usesApiKey` means Claude Code is not logged
 * in and will authenticate with the user's API key supplied by Ordo at spawn time.
 */
export interface AgentConnection {
  readonly id: AgentAdapterId
  readonly status: AgentConnectionStatus
  readonly command: string
  readonly message: string
  readonly installation?: AgentInstallation
  readonly authMethod?: string
  readonly apiProvider?: string
  readonly usesApiKey: boolean
}

export interface AgentConnectionOptions {
  readonly command?: string
  readonly cwd: string
  readonly timeoutMs?: number
  /** Claude Code only: the user's Anthropic API key, used when the CLI is not logged in. */
  readonly apiKey?: string
}

interface CommandOutput {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

const DEFAULT_TIMEOUT_MS = 15_000

const HARNESSES = {
  'claude-code': {
    name: 'Claude Code',
    defaultCommand: 'claude',
    detect: detectClaudeCode,
    statusArgs: ['auth', 'status', '--json'],
    loginHint:
      'Run `claude` in a terminal and complete /login, or set your Anthropic API key, then recheck.',
    parseStatus: parseClaudeStatus
  },
  codex: {
    name: 'Codex',
    defaultCommand: 'codex',
    detect: detectCodex,
    statusArgs: ['login', 'status'],
    loginHint: 'Run `codex login` in a terminal or log in with your OpenAI API key, then recheck.',
    parseStatus: parseCodexStatus
  }
} as const

function runStatusCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} did not report its login status within ${timeoutMs} ms`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

interface ParsedStatus {
  readonly authenticated: boolean
  readonly authMethod?: string
  readonly apiProvider?: string
}

function parseClaudeStatus(output: CommandOutput): ParsedStatus {
  let status: Record<string, unknown>
  try {
    status = JSON.parse(output.stdout) as Record<string, unknown>
  } catch {
    return { authenticated: false }
  }
  return {
    authenticated: status.loggedIn === true,
    authMethod: typeof status.authMethod === 'string' ? status.authMethod : undefined,
    apiProvider: typeof status.apiProvider === 'string' ? status.apiProvider : undefined
  }
}

function parseCodexStatus(output: CommandOutput): ParsedStatus {
  // Codex prints its login status on stderr.
  const firstLine = `${output.stderr}\n${output.stdout}`.trim().split('\n')[0] ?? ''
  if (output.exitCode !== 0 || !/^Logged in/i.test(firstLine)) {
    return { authenticated: false }
  }
  const authMethod = /chatgpt/i.test(firstLine)
    ? 'chatgpt'
    : /api key/i.test(firstLine)
      ? 'api-key'
      : undefined
  return { authenticated: true, authMethod }
}

/** Detect a harness CLI and verify that its own login is usable. Never throws. */
export async function checkAgentConnection(
  id: AgentAdapterId,
  options: AgentConnectionOptions
): Promise<AgentConnection> {
  const harness = HARNESSES[id]
  const command = options.command?.trim() || harness.defaultCommand
  let installation: AgentInstallation
  try {
    installation = await harness.detect({ command, cwd: options.cwd })
  } catch {
    return Object.freeze({
      id,
      status: 'not-found',
      command,
      usesApiKey: false,
      message: `${harness.name} executable was not found: ${command}`
    })
  }

  const readStatus = async (env?: NodeJS.ProcessEnv): Promise<ParsedStatus> => {
    try {
      return harness.parseStatus(
        await runStatusCommand(
          command,
          harness.statusArgs,
          options.cwd,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          env
        )
      )
    } catch {
      return { authenticated: false }
    }
  }

  // The CLI's own login always wins; the API key is only a fallback, and only once
  // Claude Code itself confirms it would authenticate with it.
  let parsed = await readStatus()
  let usesApiKey = false
  if (!parsed.authenticated && id === 'claude-code' && options.apiKey?.trim()) {
    parsed = await readStatus(claudeCodeEnvironment(options.apiKey))
    usesApiKey = parsed.authenticated
  }
  if (!parsed.authenticated) {
    return Object.freeze({
      id,
      status: 'not-authenticated',
      command,
      installation,
      usesApiKey: false,
      message: `${harness.name} is installed but not logged in. ${harness.loginHint}`
    })
  }
  return Object.freeze({
    id,
    status: 'connected',
    command,
    installation,
    authMethod: parsed.authMethod,
    apiProvider: parsed.apiProvider,
    usesApiKey,
    message: `${harness.name} ${installation.version} is connected.`
  })
}

export interface CodexApiKeyLoginOptions {
  readonly command?: string
  readonly cwd: string
  readonly apiKey: string
  readonly timeoutMs?: number
}

/**
 * Log Codex in with the user's OpenAI API key through its official
 * `codex login --with-api-key` flow. Codex stores the credential; Ordo keeps no copy.
 * The key is written to stdin, never passed as an argument, and never echoed back.
 */
export function loginCodexWithApiKey(options: CodexApiKeyLoginOptions): Promise<void> {
  const apiKey = options.apiKey.trim()
  if (!apiKey) {
    return Promise.reject(new Error('OpenAI API key cannot be empty'))
  }
  const command = options.command?.trim() || HARNESSES.codex.defaultCommand
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['login', '--with-api-key'], {
      cwd: options.cwd,
      shell: false,
      stdio: ['pipe', 'ignore', 'ignore']
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Codex login did not finish within ${timeoutMs} ms`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Codex rejected the API key login (exit ${String(code)})`))
      }
    })
    child.stdin.end(apiKey)
  })
}
