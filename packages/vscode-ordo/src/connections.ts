import path from 'node:path'
import type {
  AgentAdapterId,
  AgentConnection,
  AgentUsage,
  UsageWindow
} from '@pompeitech/ordo-runtime'

/**
 * How a harness can use the user's own API key when its CLI is not logged in:
 * Claude Code receives it per process from Ordo's keychain entry; Codex stores it
 * itself through its official API key login, so Ordo keeps no copy.
 */
export type ApiKeyStorage = 'ordo-keychain' | 'harness'

export interface HarnessDefinition {
  readonly id: AgentAdapterId
  readonly name: string
  readonly pathSetting: string
  readonly apiKeyProvider: string
  readonly apiKeyStorage: ApiKeyStorage
}

export const HARNESSES: readonly HarnessDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    pathSetting: 'claudeCode.path',
    apiKeyProvider: 'Anthropic',
    apiKeyStorage: 'ordo-keychain'
  },
  {
    id: 'codex',
    name: 'Codex',
    pathSetting: 'codex.path',
    apiKeyProvider: 'OpenAI',
    apiKeyStorage: 'harness'
  }
]

/** Keychain entry holding the user's Anthropic API key for Claude Code. */
export const CLAUDE_API_KEY_SECRET = 'ordo.provider.anthropic.apiKey'
/** Left behind by an earlier prototype that stored OpenAI keys; Ordo no longer keeps them. */
export const LEGACY_OPENAI_API_KEY_SECRET = 'ordo.provider.openai.apiKey'

export interface ConnectionView {
  readonly id: AgentAdapterId
  readonly name: string
  readonly status: AgentConnection['status']
  readonly command: string
  readonly configuredPath: string
  readonly version?: string
  readonly auth?: string
  readonly message: string
  readonly apiKeyProvider: string
  readonly apiKeyStorage: ApiKeyStorage
  readonly hasStoredApiKey: boolean
  readonly billing: Billing
}

/**
 * `plan`: a claude.ai or ChatGPT subscription with 5-hour/weekly windows;
 * `api-key`: pay-as-you-go on an API key or cloud provider, without plan windows.
 */
export type Billing = 'plan' | 'api-key' | 'unknown'

export function billingOf(connection: AgentConnection): Billing {
  if (connection.status !== 'connected') {
    return 'unknown'
  }
  if (
    connection.usesApiKey ||
    connection.authMethod === 'api_key' ||
    connection.authMethod === 'api-key' ||
    (connection.apiProvider !== undefined && connection.apiProvider !== 'firstParty')
  ) {
    return 'api-key'
  }
  return connection.authMethod === 'claude.ai' || connection.authMethod === 'chatgpt'
    ? 'plan'
    : 'unknown'
}

export interface UsageView {
  readonly id: AgentAdapterId
  readonly name: string
  readonly billing: Billing
  readonly source?: AgentUsage['source']
  readonly observedAt?: string
  readonly plan?: string
  readonly windows: readonly UsageWindow[]
  readonly note?: string
}

export function toUsageView(
  harness: HarnessDefinition,
  billing: Billing,
  usage: AgentUsage | undefined
): UsageView {
  const base = { id: harness.id, name: harness.name, billing }
  if (billing === 'api-key') {
    return {
      ...base,
      windows: [],
      note: 'Pay-as-you-go on your API key: there are no plan windows to show.'
    }
  }
  if (!usage) {
    return {
      ...base,
      windows: [],
      note:
        harness.id === 'claude-code'
          ? 'Shown after the next Claude Code run started from Ordo.'
          : 'Codex did not report plan limits.'
    }
  }
  return {
    ...base,
    source: usage.source,
    observedAt: usage.observedAt,
    plan: usage.plan,
    windows: usage.windows
  }
}

export function findHarness(id: unknown): HarnessDefinition | undefined {
  return HARNESSES.find(harness => harness.id === id)
}

/** An empty setting means "detect from PATH"; anything else must be an absolute path. */
export function resolveExecutableSetting(value: string | undefined): {
  readonly command?: string
  readonly error?: string
} {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return {}
  }
  if (!path.isAbsolute(trimmed)) {
    return { error: `Executable path must be absolute: ${trimmed}` }
  }
  return { command: trimmed }
}

export function describeAuth(connection: AgentConnection): string | undefined {
  if (connection.status !== 'connected') {
    return undefined
  }
  if (connection.usesApiKey) {
    return 'Using your Anthropic API key from the system keychain'
  }
  if (connection.id === 'codex' && connection.authMethod === 'api-key') {
    return 'Signed in with an API key stored by Codex'
  }
  const method = connection.authMethod ?? 'unknown method'
  const provider =
    connection.apiProvider && connection.apiProvider !== 'firstParty'
      ? ` · ${connection.apiProvider}`
      : ''
  return `Signed in via ${method}${provider}`
}

export function toConnectionView(
  harness: HarnessDefinition,
  configuredPath: string,
  connection: AgentConnection,
  hasStoredApiKey: boolean
): ConnectionView {
  return {
    id: harness.id,
    name: harness.name,
    status: connection.status,
    command: connection.command,
    configuredPath,
    version: connection.installation?.version,
    auth: describeAuth(connection),
    message: connection.message,
    apiKeyProvider: harness.apiKeyProvider,
    apiKeyStorage: harness.apiKeyStorage,
    hasStoredApiKey,
    billing: billingOf(connection)
  }
}
