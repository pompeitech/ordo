import path from 'node:path'
import {
  type AdapterContext,
  type AdapterTarget,
  type AdapterTargetConfig,
  OrdoError
} from '@pompeitech/ordo-core'

export const CODEX_AGENT_DIRECTORY = '.codex/agents'
export const CODEX_SKILL_DIRECTORY = '.agents/skills'
export const CODEX_RULE_DIRECTORY = '.agents/rules'
export const CODEX_INSTRUCTIONS_FILE = 'AGENTS.md'

export function safeRelativePath(value: string, context: string): string {
  const normalized = value.replaceAll('\\', '/')
  const segments = normalized.split('/')
  if (
    normalized.length === 0 ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(value) ||
    segments.includes('..') ||
    segments.includes('.') ||
    segments.includes('')
  ) {
    throw new OrdoError('PATH_UNSAFE', `${context} must be a safe relative path: ${value}`)
  }

  return normalized
}

export async function resolveCodexTarget(
  context: AdapterContext,
  config: AdapterTargetConfig
): Promise<AdapterTarget> {
  if (config.adapter !== 'codex') {
    throw new OrdoError('CONFIG_INVALID', 'Codex adapter received a non-Codex target')
  }

  const rootDirectory = config.outputDirectory
    ? safeRelativePath(config.outputDirectory, 'Codex output directory')
    : '.'
  const resolvedRoot = path.resolve(context.repositoryRoot, rootDirectory)
  const relativeRoot = path.relative(path.resolve(context.repositoryRoot), resolvedRoot)
  if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
    throw new OrdoError('PATH_UNSAFE', 'Codex output directory must stay inside the repository')
  }

  return Object.freeze({ adapter: 'codex', rootDirectory })
}
