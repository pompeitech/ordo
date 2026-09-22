import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'
import { DEFAULT_INSTALLATION_CONFIG, DEFAULT_ORDO_CONFIG } from './defaults.js'
import {
  type AdapterId,
  type AdapterTargetConfig,
  type ConflictStrategy,
  type ContentFilterConfig,
  type ContentKind,
  type ContentSelectionConfig,
  ORDO_CONFIG_VERSION,
  type OrdoConfig,
  type ResolvedOrdoConfig
} from './schema.js'

export const CONFIG_FILENAMES = ['ordo.config.json', '.ordorc.json'] as const

export interface LoadConfigOptions {
  readonly cwd?: string
  readonly filePath?: string
  readonly optional?: boolean
}

export interface LoadedConfig {
  readonly config: ResolvedOrdoConfig
  readonly sourcePath: string | null
}

const CONTENT_KINDS = ['agents', 'rules', 'skills', 'workflows'] as const
const ADAPTER_IDS = ['claude', 'codex'] as const
const CONFLICT_STRATEGIES = ['error', 'overwrite', 'skip'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  context: string
): void {
  const unknownKey = Object.keys(value).find(key => !keys.includes(key))
  if (unknownKey) {
    throw new OrdoError('CONFIG_INVALID', `Unknown ${context} property: ${unknownKey}`)
  }
}

function parseStringList(value: unknown, context: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new OrdoError('CONFIG_INVALID', `${context} must be an array of non-empty strings`)
  }

  if (new Set(value).size !== value.length) {
    throw new OrdoError('CONFIG_INVALID', `${context} must not contain duplicates`)
  }

  return Object.freeze([...value])
}

function parseFilter(value: unknown, context: string): ContentFilterConfig {
  if (!isRecord(value)) {
    throw new OrdoError('CONFIG_INVALID', `${context} must be an object`)
  }

  assertKnownKeys(value, ['include', 'exclude'], context)
  const include = parseStringList(value.include, `${context}.include`)
  const exclude = parseStringList(value.exclude, `${context}.exclude`)
  const overlap = include?.find(item => exclude?.includes(item))
  if (overlap) {
    throw new OrdoError('CONFIG_INVALID', `${context} includes and excludes ${overlap}`)
  }

  return Object.freeze({ include, exclude })
}

function parseContent(value: unknown): ContentSelectionConfig | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new OrdoError('CONFIG_INVALID', 'content must be an object')
  }

  assertKnownKeys(value, CONTENT_KINDS, 'content')
  const result: Partial<Record<ContentKind, ContentFilterConfig>> = {}
  for (const kind of CONTENT_KINDS) {
    if (value[kind] !== undefined) {
      result[kind] = parseFilter(value[kind], `content.${kind}`)
    }
  }

  return Object.freeze(result)
}

function parseTarget(value: unknown, index: number): AdapterTargetConfig {
  if (!isRecord(value)) {
    throw new OrdoError('CONFIG_INVALID', `targets[${index}] must be an object`)
  }

  assertKnownKeys(value, ['adapter', 'outputDirectory'], `targets[${index}]`)
  if (!ADAPTER_IDS.includes(value.adapter as AdapterId)) {
    throw new OrdoError('CONFIG_INVALID', `targets[${index}].adapter is not supported`)
  }

  if (value.outputDirectory !== undefined && typeof value.outputDirectory !== 'string') {
    throw new OrdoError('CONFIG_INVALID', `targets[${index}].outputDirectory must be a string`)
  }

  if (typeof value.outputDirectory === 'string' && value.outputDirectory.length === 0) {
    throw new OrdoError('CONFIG_INVALID', `targets[${index}].outputDirectory must not be empty`)
  }

  if (typeof value.outputDirectory === 'string') {
    const segments = value.outputDirectory.replaceAll('\\', '/').split('/')
    if (
      path.isAbsolute(value.outputDirectory) ||
      path.win32.isAbsolute(value.outputDirectory) ||
      segments.includes('..')
    ) {
      throw new OrdoError(
        'CONFIG_INVALID',
        `targets[${index}].outputDirectory must stay inside the repository`
      )
    }
  }

  return Object.freeze({
    adapter: value.adapter as AdapterId,
    outputDirectory: value.outputDirectory as string | undefined
  })
}

function parseInstallation(value: unknown): OrdoConfig['installation'] {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new OrdoError('CONFIG_INVALID', 'installation must be an object')
  }

  assertKnownKeys(value, ['conflictStrategy', 'prune'], 'installation')
  if (
    value.conflictStrategy !== undefined &&
    !CONFLICT_STRATEGIES.includes(value.conflictStrategy as ConflictStrategy)
  ) {
    throw new OrdoError('CONFIG_INVALID', 'installation.conflictStrategy is not supported')
  }

  if (value.prune !== undefined && typeof value.prune !== 'boolean') {
    throw new OrdoError('CONFIG_INVALID', 'installation.prune must be a boolean')
  }

  return Object.freeze({
    conflictStrategy: value.conflictStrategy as ConflictStrategy | undefined,
    prune: value.prune as boolean | undefined
  })
}

export function parseConfig(value: unknown): OrdoConfig {
  if (!isRecord(value)) {
    throw new OrdoError('CONFIG_INVALID', 'Configuration must be an object')
  }

  assertKnownKeys(
    value,
    ['schemaVersion', 'targets', 'contentRoot', 'content', 'installation'],
    'configuration'
  )
  if (value.schemaVersion !== ORDO_CONFIG_VERSION) {
    throw new OrdoError('CONFIG_INVALID', `schemaVersion must be ${ORDO_CONFIG_VERSION}`)
  }

  if (!Array.isArray(value.targets)) {
    throw new OrdoError('CONFIG_INVALID', 'targets must be an array')
  }

  if (
    value.contentRoot !== undefined &&
    (typeof value.contentRoot !== 'string' || value.contentRoot.trim().length === 0)
  ) {
    throw new OrdoError('CONFIG_INVALID', 'contentRoot must be a non-empty string')
  }

  const targets = value.targets.map(parseTarget)
  const duplicate = targets.find(
    (target, index) => targets.findIndex(item => item.adapter === target.adapter) !== index
  )
  if (duplicate) {
    throw new OrdoError('CONFIG_INVALID', `Duplicate adapter target: ${duplicate.adapter}`)
  }

  return Object.freeze({
    schemaVersion: ORDO_CONFIG_VERSION,
    targets: Object.freeze(targets),
    contentRoot: value.contentRoot as string | undefined,
    content: parseContent(value.content),
    installation: parseInstallation(value.installation)
  })
}

export function resolveConfig(config: OrdoConfig): ResolvedOrdoConfig {
  return Object.freeze({
    ...config,
    content: config.content ?? DEFAULT_ORDO_CONFIG.content,
    installation: Object.freeze({
      ...DEFAULT_INSTALLATION_CONFIG,
      ...config.installation
    })
  })
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

export async function findConfigPath(startDirectory: string): Promise<string | null> {
  let current = path.resolve(startDirectory)
  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = path.join(current, filename)
      if (await isFile(candidate)) {
        return candidate
      }
    }

    if (await exists(path.join(current, '.git'))) {
      return null
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }

    current = parent
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const sourcePath = options.filePath
    ? path.resolve(cwd, options.filePath)
    : await findConfigPath(cwd)

  if (!sourcePath) {
    if (options.optional ?? true) {
      return { config: DEFAULT_ORDO_CONFIG, sourcePath: null }
    }

    throw new OrdoError('CONFIG_NOT_FOUND', 'No Ordo configuration file was found')
  }

  if (!(await isFile(sourcePath))) {
    throw new OrdoError('CONFIG_NOT_FOUND', `Configuration file not found: ${sourcePath}`)
  }

  try {
    const text = await readFile(sourcePath, 'utf8')
    return { config: resolveConfig(parseConfig(JSON.parse(text))), sourcePath }
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }

    throw new OrdoError('CONFIG_INVALID', `Unable to read configuration: ${sourcePath}`, {
      cause: error
    })
  }
}
