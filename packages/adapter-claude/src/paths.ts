import path from 'node:path'
import {
  type AdapterContext,
  type AdapterTarget,
  type AdapterTargetConfig,
  OrdoError
} from '@pompeitech/ordo-core'

export const CLAUDE_DIRECTORY = '.claude'
export const CLAUDE_AGENT_DIRECTORY = '.claude/agents'
export const CLAUDE_RULE_DIRECTORY = '.claude/rules'
export const CLAUDE_SKILL_DIRECTORY = '.claude/skills'
export const CLAUDE_INSTRUCTIONS_FILE = 'CLAUDE.md'

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

export async function resolveClaudeTarget(
  context: AdapterContext,
  config: AdapterTargetConfig
): Promise<AdapterTarget> {
  if (config.adapter !== 'claude') {
    throw new OrdoError('CONFIG_INVALID', 'Claude adapter received a non-Claude target')
  }

  const rootDirectory = config.outputDirectory
    ? safeRelativePath(config.outputDirectory, 'Claude output directory')
    : '.'
  const resolvedRoot = path.resolve(context.repositoryRoot, rootDirectory)
  const relativeRoot = path.relative(path.resolve(context.repositoryRoot), resolvedRoot)
  if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
    throw new OrdoError('PATH_UNSAFE', 'Claude output directory must stay inside the repository')
  }

  return Object.freeze({ adapter: 'claude', rootDirectory })
}
