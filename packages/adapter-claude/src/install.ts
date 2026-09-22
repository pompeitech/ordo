import path from 'node:path'
import {
  type AdapterOutputFile,
  type AdapterTarget,
  type CatalogEntry,
  OrdoError
} from '@pompeitech/ordo-core'
import {
  CLAUDE_AGENT_DIRECTORY,
  CLAUDE_RULE_DIRECTORY,
  CLAUDE_SKILL_DIRECTORY,
  safeRelativePath
} from './paths.js'

function outputFile(entry: CatalogEntry, relativePath: string, content = entry.content) {
  return Object.freeze({
    relativePath,
    content,
    sourceId: entry.id,
    kind: entry.kind
  }) satisfies AdapterOutputFile
}

function mapAgent(entry: CatalogEntry): AdapterOutputFile {
  const id = safeRelativePath(entry.id, 'Agent id')

  return outputFile(entry, path.posix.join(CLAUDE_AGENT_DIRECTORY, `${id}.md`))
}

function mapSkill(entry: CatalogEntry): AdapterOutputFile {
  const id = safeRelativePath(entry.id, 'Skill id')

  return outputFile(entry, path.posix.join(CLAUDE_SKILL_DIRECTORY, id, 'SKILL.md'))
}

function mapRule(entry: CatalogEntry): AdapterOutputFile {
  if (!entry.relativePath.startsWith('rules/')) {
    throw new OrdoError('PATH_UNSAFE', `Invalid rule catalog path: ${entry.relativePath}`)
  }

  const relativePath = safeRelativePath(entry.relativePath.slice('rules/'.length), 'Rule path')

  return outputFile(entry, path.posix.join(CLAUDE_RULE_DIRECTORY, relativePath))
}

function mapWorkflow(entry: CatalogEntry): AdapterOutputFile {
  const id = `workflow-${safeRelativePath(entry.id, 'Workflow id')}`
  const description = `Run the Ordo ${entry.id} workflow. Use when the requested engineering task matches this workflow.`
  const content = [
    '---',
    `name: ${id}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    entry.body.trim(),
    ''
  ].join('\n')

  return outputFile(entry, path.posix.join(CLAUDE_SKILL_DIRECTORY, id, 'SKILL.md'), content)
}

function assertUniqueDestinations(files: readonly AdapterOutputFile[]): void {
  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.relativePath)) {
      throw new OrdoError('CATALOG_INVALID', `Duplicate Claude destination: ${file.relativePath}`)
    }

    seen.add(file.relativePath)
  }
}

export function mapClaudeEntries(
  entries: readonly CatalogEntry[],
  target: AdapterTarget
): readonly AdapterOutputFile[] {
  if (target.adapter !== 'claude') {
    throw new OrdoError('CONFIG_INVALID', 'Claude adapter received a non-Claude target')
  }

  const files = [...entries]
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
    .map(entry => {
      if (entry.kind === 'agents') {
        return mapAgent(entry)
      }

      if (entry.kind === 'skills') {
        return mapSkill(entry)
      }

      if (entry.kind === 'rules') {
        return mapRule(entry)
      }

      return mapWorkflow(entry)
    })

  assertUniqueDestinations(files)

  return Object.freeze(
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  )
}
