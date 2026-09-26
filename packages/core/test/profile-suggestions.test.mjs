import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  catalogEntryStack,
  initializeProjectProfile,
  loadCatalog,
  parseMarkdownFrontmatter,
  readProjectProfile,
  suggestProfileEntries,
  updateProjectProfileEntry
} from '../dist/index.js'

const catalogRoot = path.resolve(fileURLToPath(new URL('../../../content', import.meta.url)))
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository(dependencies) {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-suggestions-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  if (dependencies) {
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({ name: 'fixture', dependencies }, null, 2)}\n`
    )
  }
  return root
}

test('frontmatter keeps one level of nested keys as dotted keys', () => {
  const parsed = parseMarkdownFrontmatter(
    '---\nname: sample\nmetadata:\n  origin: Ordo\n  stack: [fastify, typescript]\npaths:\n  - "**/*.ts"\ndescription: Last\n---\nBody\n'
  )
  assert.equal(parsed.frontmatter.name, 'sample')
  assert.equal(parsed.frontmatter.metadata, '')
  assert.equal(parsed.frontmatter['metadata.origin'], 'Ordo')
  assert.deepEqual(parsed.frontmatter['metadata.stack'], ['fastify', 'typescript'])
  assert.equal(parsed.frontmatter.paths, '')
  assert.equal(parsed.frontmatter.description, 'Last')
  assert.equal(parsed.body, 'Body\n')
})

test('skills declare their stack in metadata and rules by directory', async () => {
  const catalog = await loadCatalog(catalogRoot)
  const find = (kind, id) => catalog.entries.find(e => e.kind === kind && e.id === id)
  assert.deepEqual(catalogEntryStack(find('skills', 'fastify-patterns')), ['fastify'])
  assert.deepEqual(catalogEntryStack(find('skills', 'testing')), [])
  assert.deepEqual(catalogEntryStack(find('rules', 'fastify-plugins')), ['fastify'])
  assert.deepEqual(catalogEntryStack(find('rules', 'common-security')), [])
})

test('a Fastify, MongoDB and TypeScript project gets matching skills and rules with evidence', async () => {
  const root = await createRepository({
    fastify: '^5.0.0',
    mongodb: '^6.0.0',
    typescript: '^5.9.0'
  })
  const catalog = await loadCatalog(catalogRoot)

  const suggestions = await suggestProfileEntries(root, catalog.entries)
  const skills = suggestions.filter(s => s.kind === 'skills').map(s => s.id)
  const rules = suggestions.filter(s => s.kind === 'rules')

  assert.ok(skills.includes('fastify-patterns'))
  assert.ok(skills.includes('mongodb-patterns'))
  assert.ok(skills.includes('typescript-patterns'))
  assert.ok(skills.includes('nodejs-patterns'))
  assert.ok(!skills.includes('react-patterns'))
  assert.ok(!skills.includes('testing'), 'general skills are not suggested from detection')
  assert.ok(rules.length > 0)
  assert.ok(rules.every(rule => rule.suggestedMode === 'default'))
  assert.ok(rules.every(rule => !rule.id.startsWith('common-') && !rule.id.startsWith('react-')))
  const fastify = suggestions.find(s => s.id === 'fastify-patterns')
  assert.equal(fastify.suggestedMode, 'recommended')
  assert.deepEqual(fastify.technologies, [
    { id: 'fastify', name: 'Fastify', evidence: ['package:fastify'] }
  ])
  assert.deepEqual(suggestions.find(s => s.id === 'nodejs-patterns').technologies[0].evidence, [
    'package.json'
  ])
})

test('a repository without a detectable stack gets no suggestions', async () => {
  const root = await createRepository()
  const catalog = await loadCatalog(catalogRoot)
  assert.deepEqual(await suggestProfileEntries(root, catalog.entries), [])
})

test('entries the team already decided about are not suggested again', async () => {
  const root = await createRepository({ fastify: '^5.0.0' })
  await initializeProjectProfile(root, catalogRoot)
  await updateProjectProfileEntry(root, catalogRoot, 'skills', 'fastify-patterns', 'disabled')
  await updateProjectProfileEntry(
    root,
    catalogRoot,
    'skills',
    'fastify-service-communication',
    'enabled'
  )
  const catalog = await loadCatalog(catalogRoot)
  const profile = await readProjectProfile(root)

  const ids = (await suggestProfileEntries(root, catalog.entries, profile)).map(s => s.id)

  assert.ok(!ids.includes('fastify-patterns'), 'disabled on purpose')
  assert.ok(ids.includes('fastify-service-communication'), 'available but not yet recommended')
  // A fresh profile already records non-common rules as recommended.
  assert.ok(!ids.some(id => id.startsWith('fastify-') && id !== 'fastify-service-communication'))
})
