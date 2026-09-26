import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import type { AgentAdapterId } from './agent-adapter.js'

/**
 * Plan usage windows reported by the harness itself (claude.ai or ChatGPT plans).
 * Only percentages and reset times are kept: no account identifiers, no tokens.
 */
export interface UsageWindow {
  /** `five-hour`, `weekly`, `weekly-opus`, `weekly-sonnet`, or `<minutes>m` for other windows. */
  readonly kind: string
  /** Share of the window already used, 0-100. */
  readonly usedPercent: number
  readonly resetsAt?: string
}

export interface AgentUsage {
  readonly id: AgentAdapterId
  /** `live`: read on demand from the harness; `last-run`: seen during the latest run. */
  readonly source: 'live' | 'last-run'
  readonly observedAt: string
  readonly plan?: string
  readonly windows: readonly UsageWindow[]
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const CLAUDE_WINDOW_KINDS: Readonly<Record<string, string>> = {
  five_hour: 'five-hour',
  seven_day: 'weekly',
  seven_day_opus: 'weekly-opus',
  seven_day_sonnet: 'weekly-sonnet'
}

function isoFromEpochSeconds(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : undefined
}

function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Reads a Claude Code `rate_limit_event` (stream-json). Utilization is a 0-1
 * fraction there; `unifiedWindows` carries every plan window at once.
 */
export function claudeUsageFromRateLimitEvent(
  message: unknown,
  now: Date = new Date()
): AgentUsage | undefined {
  const info = record(record(message)?.rate_limit_info)
  if (!info) {
    return undefined
  }
  const windows: UsageWindow[] = []
  const unified = record(info.unifiedWindows)
  const sources: Array<[string, Record<string, unknown> | undefined]> = unified
    ? Object.entries(unified).map(([type, value]) => [type, record(value)])
    : [[String(info.rateLimitType ?? ''), info]]
  for (const [type, window] of sources) {
    const kind = CLAUDE_WINDOW_KINDS[type]
    if (!kind || typeof window?.utilization !== 'number') {
      continue
    }
    windows.push({
      kind,
      usedPercent: percent(window.utilization * 100),
      resetsAt: isoFromEpochSeconds(window.resetsAt)
    })
  }
  if (windows.length === 0) {
    return undefined
  }
  return Object.freeze({
    id: 'claude-code',
    source: 'last-run',
    observedAt: now.toISOString(),
    windows: Object.freeze(windows)
  })
}

function codexWindowKind(minutes: unknown): string | undefined {
  if (typeof minutes !== 'number') {
    return undefined
  }
  return minutes === 300 ? 'five-hour' : minutes === 10080 ? 'weekly' : `${minutes}m`
}

/**
 * Reads Codex plan limits from `account/rateLimits/read` or the
 * `account/rateLimits/updated` notification. `usedPercent` is already 0-100.
 */
export function codexUsageFromRateLimits(
  value: unknown,
  source: AgentUsage['source'],
  now: Date = new Date()
): AgentUsage | undefined {
  const container = record(value)
  const limits = record(container?.rateLimits) ?? container
  if (!limits) {
    return undefined
  }
  const windows: UsageWindow[] = []
  for (const window of [record(limits.primary), record(limits.secondary)]) {
    const kind = codexWindowKind(window?.windowDurationMins)
    if (!kind || typeof window?.usedPercent !== 'number') {
      continue
    }
    windows.push({
      kind,
      usedPercent: percent(window.usedPercent),
      resetsAt: isoFromEpochSeconds(window.resetsAt)
    })
  }
  if (windows.length === 0) {
    return undefined
  }
  return Object.freeze({
    id: 'codex',
    source,
    observedAt: now.toISOString(),
    plan: typeof limits.planType === 'string' ? limits.planType : undefined,
    windows: Object.freeze(windows)
  })
}

export interface CodexUsageOptions {
  readonly command?: string
  readonly cwd: string
  readonly timeoutMs?: number
}

/**
 * Asks Codex for the signed-in plan's limits through the official app-server
 * `account/rateLimits/read`. Starts no model turn. Returns undefined when Codex is
 * unavailable or has no plan limits (for example with an API key login).
 */
export function readCodexUsage(options: CodexUsageOptions): Promise<AgentUsage | undefined> {
  const command = options.command?.trim() || 'codex'
  const timeoutMs = options.timeoutMs ?? 20_000
  return new Promise(resolve => {
    let settled = false
    const child = spawn(command, ['app-server'], {
      cwd: options.cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore']
    })
    const finish = (usage: AgentUsage | undefined) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.kill('SIGTERM')
      resolve(usage)
    }
    const timer = setTimeout(() => finish(undefined), timeoutMs)
    const send = (message: unknown) => {
      if (child.stdin.writable) {
        child.stdin.write(`${JSON.stringify(message)}\n`)
      }
    }
    child.once('error', () => finish(undefined))
    child.once('close', () => finish(undefined))
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
      let message: Record<string, unknown> | undefined
      try {
        message = record(JSON.parse(line))
      } catch {
        finish(undefined)
        return
      }
      if (message?.id === 1) {
        send({ jsonrpc: '2.0', method: 'initialized' })
        send({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read' })
      } else if (message?.id === 2) {
        finish(message.error ? undefined : codexUsageFromRateLimits(message.result, 'live'))
      }
    })
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'ordo', version: '0' } }
    })
  })
}

export interface UsageStoreOptions {
  /** Defaults to `$ORDO_STATE_DIR/usage.json` or `$XDG_STATE_HOME/ordo/usage.json`. */
  readonly filePath?: string
}

/** Machine-local and personal: never inside the repository or `.ordo/`. */
export function defaultUsageStatePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ORDO_STATE_DIR) {
    return path.join(env.ORDO_STATE_DIR, 'usage.json')
  }
  const stateHome = env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state')
  return path.join(stateHome, 'ordo', 'usage.json')
}

async function readStore(filePath: string): Promise<Record<string, AgentUsage>> {
  try {
    const parsed = record(JSON.parse(await readFile(filePath, 'utf8')))
    return (record(parsed?.agents) as Record<string, AgentUsage> | undefined) ?? {}
  } catch {
    return {}
  }
}

export async function recordAgentUsage(
  usage: AgentUsage,
  options: UsageStoreOptions = {}
): Promise<void> {
  const filePath = options.filePath ?? defaultUsageStatePath()
  const agents = { ...(await readStore(filePath)), [usage.id]: usage }
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, agents }, null, 2)}\n`, {
    mode: 0o600
  })
  await rename(temporary, filePath)
}

export async function readRecordedUsage(
  id: AgentAdapterId,
  options: UsageStoreOptions = {}
): Promise<AgentUsage | undefined> {
  const stored = (await readStore(options.filePath ?? defaultUsageStatePath()))[id]
  return stored && Array.isArray(stored.windows) ? stored : undefined
}
