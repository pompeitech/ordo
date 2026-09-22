import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadCatalog, OrdoError } from '@pompeitech/ordo-core'
import {
  CODEX_AGENT_DIRECTORY,
  CODEX_RULE_DIRECTORY,
  CODEX_SKILL_DIRECTORY,
  codexAdapter,
  mapCodexEntries
} from '../dist/index.js'

const temporaryDirectories = []
const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testDirectory, '../../..')

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(prefix = 'ordo-codex-') {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)

  return directory
}

function entry({ id, kind, relativePath, content, body, description }) {
  return Object.freeze({
    id,
    kind,
    name: id,
    description,
    sourcePath: `/catalog/${relativePath}`,
    relativePath,
    content,
    body: body ?? content,
    frontmatter: Object.freeze({
      name: id,
      ...(description ? { description } : {})
    })
  })
}

function fixtureEntries() {
  return [
    entry({
      id: 'planner',
      kind: 'agents',
      relativePath: 'agents/planner.md',
      description: 'Plan complex changes before implementation.',
      content: 'agent source',
      body: '# Planner\n\nUse evidence and produce an implementation plan.'
    }),
    entry({
      id: 'testing',
      kind: 'skills',
      relativePath: 'skills/testing/SKILL.md',
      description: 'Build reliable test suites.',
      content: '---\nname: testing\ndescription: Build reliable test suites.\n---\n\n# Testing\n'
    }),
    entry({
      id: 'common-testing',
      kind: 'rules',
      relativePath: 'rules/common/testing.md',
      description: 'Require tests for every behavior change.',
      content: '# Testing rules\n\nAlways add regression coverage.\n'
    }),
    entry({
      id: 'review',
      kind: 'workflows',
      relativePath: 'workflows/review.md',
      content: '## Objective\n\nReview a change.\n'
    })
  ]
}

test('adapter declares stable Codex metadata and target paths', async () => {
  const repositoryRoot = await temporaryDirectory()

  assert.equal(codexAdapter.id, 'codex')
  assert.equal(codexAdapter.displayName, 'Codex')
  assert.deepEqual(codexAdapter.supportedContent, ['agents', 'rules', 'skills', 'workflows'])
  assert.deepEqual(await codexAdapter.resolveTarget({ repositoryRoot }, { adapter: 'codex' }), {
    adapter: 'codex',
    rootDirectory: '.'
  })
  assert.deepEqual(
    await codexAdapter.resolveTarget(
      { repositoryRoot },
      { adapter: 'codex', outputDirectory: 'tools/codex' }
    ),
    { adapter: 'codex', rootDirectory: 'tools/codex' }
  )
})

test('adapter detects official Codex repository markers', async () => {
  const repositoryRoot = await temporaryDirectory()
  await mkdir(path.join(repositoryRoot, '.codex'), { recursive: true })
  await mkdir(path.join(repositoryRoot, '.agents', 'skills'), { recursive: true })
  await writeFile(path.join(repositoryRoot, 'AGENTS.md'), '# Instructions\n')

  const detection = await codexAdapter.detect({ repositoryRoot })

  assert.equal(detection.detected, true)
  assert.deepEqual(detection.evidence, [
    path.join(repositoryRoot, '.agents', 'skills'),
    path.join(repositoryRoot, '.codex'),
    path.join(repositoryRoot, 'AGENTS.md')
  ])
})

test('adapter maps every canonical content kind to a Codex-supported layout', () => {
  const entries = fixtureEntries()
  const originalEntries = structuredClone(entries)
  const target = { adapter: 'codex', rootDirectory: '.' }
  const files = mapCodexEntries(entries, target)

  assert.deepEqual(entries, originalEntries)
  assert.deepEqual(
    files.map(file => file.relativePath),
    [
      `${CODEX_SKILL_DIRECTORY}/testing/SKILL.md`,
      `${CODEX_SKILL_DIRECTORY}/workflow-review/SKILL.md`,
      `${CODEX_AGENT_DIRECTORY}/planner.toml`,
      `${CODEX_RULE_DIRECTORY}/common/testing.md`,
      'AGENTS.md'
    ].sort()
  )

  const agent = files.find(file => file.relativePath.endsWith('/planner.toml'))
  assert.match(agent.content, /^name = "planner"/m)
  assert.match(agent.content, /^description = "Plan complex changes before implementation\."/m)
  assert.match(agent.content, /^developer_instructions = /m)
  assert.doesNotMatch(agent.content, /^model = /m)
  assert.doesNotMatch(agent.content, /^tools = /m)

  const skill = files.find(file => file.relativePath.endsWith('/testing/SKILL.md'))
  assert.equal(skill.content, entries.find(item => item.kind === 'skills').content)

  const workflow = files.find(file => file.relativePath.includes('workflow-review'))
  assert.match(workflow.content, /^---\nname: workflow-review\n/m)
  assert.match(workflow.content, /## Objective/)

  const instructions = files.find(file => file.relativePath === 'AGENTS.md')
  assert.match(instructions.content, /\.agents\/rules\/common\/testing\.md/)
  assert.match(
    instructions.content,
    /Read every rule listed below before changing or reviewing code/
  )
})

test('mapping is deterministic regardless of catalog order', () => {
  const entries = fixtureEntries()
  const target = { adapter: 'codex', rootDirectory: '.' }

  assert.deepEqual(
    mapCodexEntries(entries, target),
    mapCodexEntries([...entries].reverse(), target)
  )
})

test('adapter maps the complete repository catalog without collisions', async () => {
  const catalog = await loadCatalog(path.join(repositoryRoot, 'content'))
  const files = mapCodexEntries(catalog.entries, { adapter: 'codex', rootDirectory: '.' })
  const destinations = files.map(file => file.relativePath)

  assert.equal(files.length, catalog.entries.length + 1)
  assert.equal(new Set(destinations).size, destinations.length)
  assert.equal(
    files.every(file => file.content.trim().length > 0),
    true
  )
  assert.equal(
    files.filter(file => file.relativePath.startsWith(`${CODEX_AGENT_DIRECTORY}/`)).length,
    catalog.entries.filter(item => item.kind === 'agents').length
  )
  assert.equal(
    files.filter(file => file.relativePath.endsWith('/SKILL.md')).length,
    catalog.entries.filter(item => item.kind === 'skills' || item.kind === 'workflows').length
  )
})

test('agent TOML safely escapes quotes and newlines', () => {
  const agent = entry({
    id: 'reviewer',
    kind: 'agents',
    relativePath: 'agents/reviewer.md',
    description: 'Review "dangerous" changes.',
    content: 'agent source',
    body: 'First line.\nSecond line contains "quotes".'
  })

  const [file] = mapCodexEntries([agent], { adapter: 'codex', rootDirectory: '.' })

  assert.match(file.content, /description = "Review \\"dangerous\\" changes\."/)
  assert.match(file.content, /developer_instructions = "First line\.\\nSecond line/)
})

test('adapter rejects unsafe targets and catalog paths', async () => {
  const repositoryRoot = await temporaryDirectory()

  await assert.rejects(
    codexAdapter.resolveTarget(
      { repositoryRoot },
      { adapter: 'codex', outputDirectory: '../outside' }
    ),
    error => error instanceof OrdoError && error.code === 'PATH_UNSAFE'
  )

  const unsafeRule = entry({
    id: 'unsafe',
    kind: 'rules',
    relativePath: 'rules/../outside.md',
    description: 'Unsafe fixture.',
    content: '# Unsafe\n'
  })

  assert.throws(
    () => mapCodexEntries([unsafeRule], { adapter: 'codex', rootDirectory: '.' }),
    error => error instanceof OrdoError && error.code === 'PATH_UNSAFE'
  )
})

test('validation reports obstructed directories and legacy skill locations', async () => {
  const repositoryRoot = await temporaryDirectory()
  await mkdir(path.join(repositoryRoot, '.codex'), { recursive: true })
  await writeFile(path.join(repositoryRoot, '.codex', 'agents'), 'not a directory\n')
  await mkdir(path.join(repositoryRoot, '.codex', 'skills'), { recursive: true })

  const issues = await codexAdapter.validate(
    { repositoryRoot },
    { adapter: 'codex', rootDirectory: '.' }
  )

  assert.equal(issues.find(issue => issue.code === 'invalid-agent-directory')?.severity, 'error')
  assert.equal(issues.find(issue => issue.code === 'legacy-skill-directory')?.severity, 'warning')
})
