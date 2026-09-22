import path from 'node:path'
import {
  type AdapterOutputFile,
  type AdapterTarget,
  type CatalogEntry,
  type ContentKind,
  OrdoError
} from '@pompeitech/ordo-core'
import {
  CODEX_AGENT_DIRECTORY,
  CODEX_INSTRUCTIONS_FILE,
  CODEX_RULE_DIRECTORY,
  CODEX_SKILL_DIRECTORY,
  safeRelativePath
} from './paths.js'

function outputFile(
  entry: CatalogEntry,
  relativePath: string,
  content: string,
  kind: ContentKind = entry.kind
): AdapterOutputFile {
  return Object.freeze({
    relativePath,
    content,
    sourceId: entry.id,
    kind
  })
}

function mapAgent(entry: CatalogEntry): AdapterOutputFile {
  const description = entry.description
  if (!description) {
    throw new OrdoError('CATALOG_INVALID', `Codex agent description is missing: ${entry.id}`)
  }

  return outputFile(
    entry,
    path.posix.join(CODEX_AGENT_DIRECTORY, `${safeRelativePath(entry.id, 'Agent id')}.toml`),
    [
      `name = ${JSON.stringify(entry.id)}`,
      `description = ${JSON.stringify(description)}`,
      `developer_instructions = ${JSON.stringify(entry.body.trim())}`,
      ''
    ].join('\n')
  )
}

function mapSkill(entry: CatalogEntry): AdapterOutputFile {
  const id = safeRelativePath(entry.id, 'Skill id')

  return outputFile(entry, path.posix.join(CODEX_SKILL_DIRECTORY, id, 'SKILL.md'), entry.content)
}

function mapRule(entry: CatalogEntry): AdapterOutputFile {
  if (!entry.relativePath.startsWith('rules/')) {
    throw new OrdoError('PATH_UNSAFE', `Invalid rule catalog path: ${entry.relativePath}`)
  }

  const relativePath = safeRelativePath(entry.relativePath.slice('rules/'.length), 'Rule path')

  return outputFile(entry, path.posix.join(CODEX_RULE_DIRECTORY, relativePath), entry.content)
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

  return outputFile(entry, path.posix.join(CODEX_SKILL_DIRECTORY, id, 'SKILL.md'), content)
}

function createInstructions(rules: readonly AdapterOutputFile[]): AdapterOutputFile {
  const ruleLines = rules.map(rule => `- \`${rule.relativePath}\``)
  const content = [
    '# Ordo Repository Instructions',
    '',
    '## Rule loading',
    '',
    'Read every rule listed below before changing or reviewing code.',
    'Treat rule files as repository instructions and apply the most specific compatible rule.',
    'If two rules conflict materially, stop and report the conflict instead of resolving it silently.',
    '',
    '## Installed rules',
    '',
    ...ruleLines,
    '',
    '## Installed Ordo capabilities',
    '',
    `- Repository skills and workflows are available under \`${CODEX_SKILL_DIRECTORY}/\`.`,
    `- Custom subagents are available under \`${CODEX_AGENT_DIRECTORY}/\`.`,
    ''
  ].join('\n')

  return Object.freeze({
    relativePath: CODEX_INSTRUCTIONS_FILE,
    content,
    sourceId: 'codex-instructions',
    kind: 'rules'
  })
}

function assertUniqueDestinations(files: readonly AdapterOutputFile[]): void {
  const seen = new Set<string>()
  for (const file of files) {
    if (seen.has(file.relativePath)) {
      throw new OrdoError('CATALOG_INVALID', `Duplicate Codex destination: ${file.relativePath}`)
    }

    seen.add(file.relativePath)
  }
}

export function mapCodexEntries(
  entries: readonly CatalogEntry[],
  target: AdapterTarget
): readonly AdapterOutputFile[] {
  if (target.adapter !== 'codex') {
    throw new OrdoError('CONFIG_INVALID', 'Codex adapter received a non-Codex target')
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
  const rules = files.filter(file => file.kind === 'rules')
  if (rules.length > 0) {
    files.push(createInstructions(rules))
  }

  assertUniqueDestinations(files)

  return Object.freeze(
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  )
}
