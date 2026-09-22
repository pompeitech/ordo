import { lstat } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterContext, AdapterTarget, AdapterValidationIssue } from '@pompeitech/ordo-core'
import {
  CLAUDE_AGENT_DIRECTORY,
  CLAUDE_DIRECTORY,
  CLAUDE_RULE_DIRECTORY,
  CLAUDE_SKILL_DIRECTORY
} from './paths.js'

interface ExpectedPath {
  readonly path: string
  readonly code: string
}

async function inspectExpectedDirectory(
  rootDirectory: string,
  expected: ExpectedPath
): Promise<AdapterValidationIssue | null> {
  const candidate = path.join(rootDirectory, expected.path)
  try {
    if ((await lstat(candidate)).isDirectory()) {
      return null
    }

    return {
      code: expected.code,
      severity: 'error',
      message: 'Claude directory path is obstructed by another file type',
      path: candidate
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    return {
      code: expected.code,
      severity: 'error',
      message: 'Unable to inspect Claude directory path',
      path: candidate
    }
  }
}

export async function validateClaudeTarget(
  context: AdapterContext,
  target: AdapterTarget
): Promise<readonly AdapterValidationIssue[]> {
  const rootDirectory = path.resolve(context.repositoryRoot, target.rootDirectory)
  const issues = (
    await Promise.all(
      [
        { path: CLAUDE_DIRECTORY, code: 'invalid-claude-directory' },
        { path: CLAUDE_AGENT_DIRECTORY, code: 'invalid-agent-directory' },
        { path: CLAUDE_RULE_DIRECTORY, code: 'invalid-rule-directory' },
        { path: CLAUDE_SKILL_DIRECTORY, code: 'invalid-skill-directory' }
      ].map(expected => inspectExpectedDirectory(rootDirectory, expected))
    )
  ).filter((issue): issue is AdapterValidationIssue => issue !== null)

  return Object.freeze(
    issues.sort((left, right) =>
      `${left.severity}:${left.code}`.localeCompare(`${right.severity}:${right.code}`)
    )
  )
}
