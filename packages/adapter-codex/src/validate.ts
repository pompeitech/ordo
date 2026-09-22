import { lstat } from 'node:fs/promises'
import path from 'node:path'
import type { AdapterContext, AdapterTarget, AdapterValidationIssue } from '@pompeitech/ordo-core'
import {
  CODEX_AGENT_DIRECTORY,
  CODEX_INSTRUCTIONS_FILE,
  CODEX_RULE_DIRECTORY,
  CODEX_SKILL_DIRECTORY
} from './paths.js'

interface ExpectedPath {
  readonly path: string
  readonly type: 'directory' | 'file'
  readonly code: string
}

async function inspectExpectedPath(
  rootDirectory: string,
  expected: ExpectedPath
): Promise<AdapterValidationIssue | null> {
  const candidate = path.join(rootDirectory, expected.path)
  try {
    const candidateStat = await lstat(candidate)
    const valid =
      expected.type === 'directory' ? candidateStat.isDirectory() : candidateStat.isFile()
    if (valid) {
      return null
    }

    return {
      code: expected.code,
      severity: 'error',
      message: `Codex ${expected.type} path is obstructed by another file type`,
      path: candidate
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    return {
      code: expected.code,
      severity: 'error',
      message: `Unable to inspect Codex ${expected.type} path`,
      path: candidate
    }
  }
}

export async function validateCodexTarget(
  context: AdapterContext,
  target: AdapterTarget
): Promise<readonly AdapterValidationIssue[]> {
  const rootDirectory = path.resolve(context.repositoryRoot, target.rootDirectory)
  const issues = (
    await Promise.all(
      [
        {
          path: CODEX_AGENT_DIRECTORY,
          type: 'directory',
          code: 'invalid-agent-directory'
        },
        {
          path: CODEX_SKILL_DIRECTORY,
          type: 'directory',
          code: 'invalid-skill-directory'
        },
        {
          path: CODEX_RULE_DIRECTORY,
          type: 'directory',
          code: 'invalid-rule-directory'
        },
        {
          path: CODEX_INSTRUCTIONS_FILE,
          type: 'file',
          code: 'invalid-instructions-file'
        }
      ].map(expected => inspectExpectedPath(rootDirectory, expected as ExpectedPath))
    )
  ).filter((issue): issue is AdapterValidationIssue => issue !== null)

  const legacySkillDirectory = path.join(rootDirectory, '.codex', 'skills')
  try {
    if ((await lstat(legacySkillDirectory)).isDirectory()) {
      issues.push({
        code: 'legacy-skill-directory',
        severity: 'warning',
        message: 'Codex repository skills should use .agents/skills instead of .codex/skills',
        path: legacySkillDirectory
      })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      issues.push({
        code: 'legacy-skill-directory-unreadable',
        severity: 'warning',
        message: 'Unable to inspect the legacy Codex skill directory',
        path: legacySkillDirectory
      })
    }
  }

  return Object.freeze(
    issues.sort((left, right) =>
      `${left.severity}:${left.code}`.localeCompare(`${right.severity}:${right.code}`)
    )
  )
}
