import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadCatalog, OrdoError } from '@pompeitech/ordo-core'
import {
  CLAUDE_AGENT_DIRECTORY,
  CLAUDE_RULE_DIRECTORY,
  CLAUDE_SKILL_DIRECTORY,
  claudeAdapter,
  mapClaudeEntries
} from '../dist/index.js'

const temporaryDirectories = []
const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testDirectory, '../../..')

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(prefix = 'ordo-claude-') {
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
      content:
        '---\nname: planner\ndescription: Plan complex changes before implementation.\ntools: Read, Grep\nmodel: opus\n---\n\n# Planner\n',
      body: '# Planner\n'
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

test('adapter declares stable Claude metadata and target paths', async () => {
  const repositoryRoot = await temporaryDirectory()

  assert.equal(claudeAdapter.id, 'claude')
  assert.equal(claudeAdapter.displayName, 'Claude Code')
  assert.deepEqual(claudeAdapter.supportedContent, ['agents', 'rules', 'skills', 'workflows'])
  assert.deepEqual(await claudeAdapter.resolveTarget({ repositoryRoot }, { adapter: 'claude' }), {
    adapter: 'claude',
    rootDirectory: '.'
  })
  assert.deepEqual(
    await claudeAdapter.resolveTarget(
      { repositoryRoot },
      { adapter: 'claude', outputDirectory: 'tools/claude' }
    ),
    { adapter: 'claude', rootDirectory: 'tools/claude' }
  )
})

test('adapter detects official Claude Code repository markers', async () => {
  const repositoryRoot = await temporaryDirectory()
  await mkdir(path.join(repositoryRoot, '.claude', 'agents'), { recursive: true })
  await mkdir(path.join(repositoryRoot, '.claude', 'rules'), { recursive: true })
  await mkdir(path.join(repositoryRoot, '.claude', 'skills'), { recursive: true })
  await writeFile(path.join(repositoryRoot, 'CLAUDE.md'), '# Instructions\n')

  const detection = await claudeAdapter.detect({ repositoryRoot })

  assert.equal(detection.detected, true)
  assert.deepEqual(detection.evidence, [
    path.join(repositoryRoot, '.claude'),
    path.join(repositoryRoot, '.claude', 'agents'),
    path.join(repositoryRoot, '.claude', 'rules'),
    path.join(repositoryRoot, '.claude', 'skills'),
    path.join(repositoryRoot, 'CLAUDE.md')
  ])
})

test('adapter maps every canonical content kind to a Claude-supported layout', () => {
  const entries = fixtureEntries()
  const originalEntries = structuredClone(entries)
  const files = mapClaudeEntries(entries, { adapter: 'claude', rootDirectory: '.' })

  assert.deepEqual(entries, originalEntries)
  assert.deepEqual(
    files.map(file => file.relativePath),
    [
      `${CLAUDE_AGENT_DIRECTORY}/planner.md`,
      `${CLAUDE_RULE_DIRECTORY}/common/testing.md`,
      `${CLAUDE_SKILL_DIRECTORY}/testing/SKILL.md`,
      `${CLAUDE_SKILL_DIRECTORY}/workflow-review/SKILL.md`
    ].sort()
  )

  const agent = files.find(file => file.relativePath.endsWith('/planner.md'))
  assert.match(agent.content, /^tools: Read, Grep$/m)
  assert.match(agent.content, /^model: opus$/m)

  const skill = files.find(file => file.relativePath.endsWith('/testing/SKILL.md'))
  assert.equal(skill.content, entries.find(item => item.kind === 'skills').content)

  const rule = files.find(file => file.relativePath.endsWith('/common/testing.md'))
  assert.equal(rule.content, entries.find(item => item.kind === 'rules').content)

  const workflow = files.find(file => file.relativePath.includes('workflow-review'))
  assert.match(workflow.content, /^---\nname: workflow-review\n/m)
  assert.match(workflow.content, /## Objective/)
})

test('mapping is deterministic regardless of catalog order', () => {
  const entries = fixtureEntries()
  const target = { adapter: 'claude', rootDirectory: '.' }

  assert.deepEqual(
    mapClaudeEntries(entries, target),
    mapClaudeEntries([...entries].reverse(), target)
  )
})

test('adapter maps the complete repository catalog without collisions', async () => {
  const catalog = await loadCatalog(path.join(repositoryRoot, 'content'))
  const files = mapClaudeEntries(catalog.entries, { adapter: 'claude', rootDirectory: '.' })
  const destinations = files.map(file => file.relativePath)

  assert.equal(files.length, catalog.entries.length)
  assert.equal(new Set(destinations).size, destinations.length)
  assert.equal(
    files.every(file => file.content.trim().length > 0),
    true
  )
  assert.equal(
    files.filter(file => file.relativePath.startsWith(`${CLAUDE_AGENT_DIRECTORY}/`)).length,
    catalog.entries.filter(item => item.kind === 'agents').length
  )
  assert.equal(
    files.filter(file => file.relativePath.endsWith('/SKILL.md')).length,
    catalog.entries.filter(item => item.kind === 'skills' || item.kind === 'workflows').length
  )
})

test('adapter rejects unsafe targets and catalog paths', async () => {
  const repositoryRoot = await temporaryDirectory()

  await assert.rejects(
    claudeAdapter.resolveTarget(
      { repositoryRoot },
      { adapter: 'claude', outputDirectory: '../outside' }
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
    () => mapClaudeEntries([unsafeRule], { adapter: 'claude', rootDirectory: '.' }),
    error => error instanceof OrdoError && error.code === 'PATH_UNSAFE'
  )
})

test('validation reports obstructed Claude directories', async () => {
  const repositoryRoot = await temporaryDirectory()
  await mkdir(path.join(repositoryRoot, '.claude'), { recursive: true })
  await writeFile(path.join(repositoryRoot, '.claude', 'agents'), 'not a directory\n')

  const issues = await claudeAdapter.validate(
    { repositoryRoot },
    { adapter: 'claude', rootDirectory: '.' }
  )

  assert.equal(issues.find(issue => issue.code === 'invalid-agent-directory')?.severity, 'error')
})
