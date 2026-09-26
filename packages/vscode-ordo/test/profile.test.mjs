import assert from 'node:assert/strict'
import { appendFile, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  initializeProjectProfile,
  loadCatalog,
  readProjectProfile,
  updateProjectProfileEntry,
  validateProjectProfile
} from '@pompeitech/ordo-core'
import {
  buildProfileView,
  parseProfileChange,
  previewSession,
  resolveProfileContentRoot,
  summarizeProfile
} from '../dist/profile-model.js'

const shippedCatalog = path.resolve(fileURLToPath(new URL('../../../content', import.meta.url)))
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository({ withOwnCatalog = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-profile-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  if (withOwnCatalog) {
    await cp(shippedCatalog, path.join(root, 'content'), { recursive: true })
  }
  return root
}

async function readView(root, bundledRoot = shippedCatalog) {
  const content = await resolveProfileContentRoot(root, bundledRoot)
  const catalog = await loadCatalog(content.root)
  let profile
  try {
    profile = await readProjectProfile(root)
  } catch {
    profile = undefined
  }
  const errors = profile ? (await validateProjectProfile(root, content.root)).errors : []
  return { content, view: buildProfileView(catalog.entries, profile, errors, content) }
}

function group(view, kind) {
  return view.kinds.find(entry => entry.kind === kind).items
}

test('the catalog comes from the repository when it has one, otherwise from Ordo', async () => {
  const plain = await createRepository()
  const own = await createRepository({ withOwnCatalog: true })
  assert.deepEqual(await resolveProfileContentRoot(plain, shippedCatalog), {
    root: shippedCatalog,
    source: 'bundled'
  })
  assert.deepEqual(await resolveProfileContentRoot(own, shippedCatalog), {
    root: path.join(own, 'content'),
    source: 'repository'
  })
})

test('before setup every catalog entry is listed and nothing is in the profile', async () => {
  const root = await createRepository()
  const { view } = await readView(root)
  const catalog = await loadCatalog(shippedCatalog)
  assert.equal(view.exists, false)
  assert.equal(view.session, undefined)
  assert.deepEqual(view.suggestions, [])
  for (const kind of ['agents', 'skills', 'rules', 'workflows']) {
    const items = group(view, kind)
    assert.equal(items.length, catalog.entries.filter(entry => entry.kind === kind).length)
    assert.ok(items.every(item => item.mode === undefined && !item.changed && !item.missing))
  }
})

test('a new profile applies the documented defaults and previews the session', async () => {
  const root = await createRepository()
  await initializeProjectProfile(root, shippedCatalog)
  const { view } = await readView(root)

  assert.equal(view.exists, true)
  assert.deepEqual(view.errors, [])
  assert.ok(group(view, 'agents').every(item => item.mode === 'enabled'))
  assert.ok(group(view, 'skills').every(item => item.mode === undefined))
  for (const rule of group(view, 'rules')) {
    assert.equal(rule.mode, rule.id.startsWith('common-') ? 'required' : 'recommended')
  }
  assert.equal(view.session.agent, undefined)
  assert.match(view.session.problem, /default/)
  assert.ok(view.session.rules.length > 0)
  assert.ok(view.session.rules.every(id => id.startsWith('common-')))
})

test('saved choices change what every session receives', async () => {
  const root = await createRepository()
  await initializeProjectProfile(root, shippedCatalog)
  const [agent] = group((await readView(root)).view, 'agents')
  const [skill, recommendedSkill] = group((await readView(root)).view, 'skills')

  for (const change of [
    { kind: 'agents', id: agent.id, mode: 'default' },
    { kind: 'skills', id: skill.id, mode: 'required' },
    { kind: 'skills', id: recommendedSkill.id, mode: 'recommended' }
  ]) {
    await updateProjectProfileEntry(root, shippedCatalog, change.kind, change.id, change.mode)
  }
  const profile = await readProjectProfile(root)
  const session = previewSession(profile)

  assert.equal(session.agent, agent.id)
  assert.equal(session.agentRequired, false)
  assert.deepEqual(session.skills, [skill.id])
  assert.deepEqual(summarizeProfile(profile), {
    agents: group((await readView(root)).view, 'agents').length,
    defaultAgent: agent.id,
    skills: 2,
    requiredRules: session.rules.length
  })
})

test('a catalog entry that changes after it was recorded is flagged until accepted', async () => {
  const root = await createRepository({ withOwnCatalog: true })
  const catalogRoot = path.join(root, 'content')
  await initializeProjectProfile(root, catalogRoot)
  const rule = group((await readView(root)).view, 'rules').find(item => item.mode === 'required')
  const source = (await loadCatalog(catalogRoot)).entries.find(
    entry => entry.kind === 'rules' && entry.id === rule.id
  ).sourcePath
  await appendFile(source, '\nOne more team convention.\n')

  const flagged = (await readView(root)).view
  assert.equal(group(flagged, 'rules').find(item => item.id === rule.id).changed, true)
  assert.ok(flagged.errors.some(error => error.includes(rule.id)))

  await updateProjectProfileEntry(root, catalogRoot, 'rules', rule.id, 'required')
  const accepted = (await readView(root)).view
  assert.equal(group(accepted, 'rules').find(item => item.id === rule.id).changed, false)
  assert.deepEqual(accepted.errors, [])
})

test('only well-formed profile changes from the webview are accepted', () => {
  assert.deepEqual(parseProfileChange({ kind: 'skills', id: 'doctor', mode: 'default' }), {
    kind: 'skills',
    id: 'doctor',
    mode: 'default'
  })
  for (const invalid of [
    null,
    'skills',
    { kind: 'plugins', id: 'doctor', mode: 'default' },
    { kind: 'skills', id: '../escape', mode: 'default' },
    { kind: 'skills', id: 'doctor', mode: 'always' }
  ]) {
    assert.equal(parseProfileChange(invalid), undefined)
  }
})

test('suggestions carry the catalog name and a readable reason', async () => {
  const root = await createRepository()
  const content = await resolveProfileContentRoot(root, shippedCatalog)
  const catalog = await loadCatalog(content.root)
  const view = buildProfileView(catalog.entries, undefined, [], content, [
    {
      kind: 'skills',
      id: 'fastify-patterns',
      suggestedMode: 'recommended',
      technologies: [{ id: 'fastify', name: 'Fastify', evidence: ['package:fastify'] }]
    }
  ])
  assert.equal(view.suggestions.length, 1)
  assert.equal(view.suggestions[0].name, 'fastify-patterns')
  assert.equal(view.suggestions[0].suggestedMode, 'recommended')
  assert.deepEqual(view.suggestions[0].reasons, ['Fastify (package:fastify)'])
  assert.match(view.suggestions[0].description, /Fastify/)
})
