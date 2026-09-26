import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  initializeProjectProfile,
  previewProjectProfileEntry,
  readProjectProfile,
  resolveProfileSessionSelection,
  updateProjectProfileEntry,
  validateProjectProfile
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-profile-'))
  temporaryDirectories.push(directory)
  const content = path.join(directory, 'content')
  await mkdir(path.join(directory, '.git'))
  await mkdir(path.join(content, 'agents'), { recursive: true })
  await mkdir(path.join(content, 'skills', 'release'), { recursive: true })
  await mkdir(path.join(content, 'rules'), { recursive: true })
  await writeFile(
    path.join(content, 'agents', 'planner.md'),
    '---\nname: planner\ndescription: Project planner\n---\n\nPlanner instructions.\n'
  )
  await writeFile(
    path.join(content, 'agents', 'reviewer.md'),
    '---\nname: reviewer\ndescription: Project reviewer\n---\n\nReviewer instructions.\n'
  )
  await writeFile(
    path.join(content, 'skills', 'release', 'SKILL.md'),
    '---\nname: release\ndescription: Release procedure\n---\n\nRelease steps.\n'
  )
  await writeFile(
    path.join(content, 'rules', 'safe.md'),
    '---\nname: safe\ndescription: Safe rule\n---\n\nDo not expose secrets.\n'
  )
  return { directory, content }
}

test('initializes a shared profile by referencing catalog ids and resolves defaults', async () => {
  const { directory, content } = await createRepository()
  const profile = await initializeProjectProfile(directory, content, {
    agentIds: ['planner', 'reviewer'],
    skillIds: ['release'],
    defaultAgentId: 'planner'
  })
  const selection = resolveProfileSessionSelection(profile, undefined, ['release'], ['safe'])

  assert.equal(profile.agents.length, 2)
  assert.equal(profile.agents.find(entry => entry.id === 'planner').mode, 'default')
  assert.equal(profile.rules[0].mode, 'recommended')
  assert.deepEqual(selection.agent.id, 'planner')
  assert.deepEqual(
    selection.skills.map(entry => entry.id),
    ['release']
  )
  assert.deepEqual(
    selection.rules.map(entry => entry.id),
    ['safe']
  )
  assert.equal((await validateProjectProfile(directory, content)).valid, true)
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, '.ordo', 'profile.json'), 'utf8')),
    profile
  )
})

test('requires explicit selection when there is no default and rejects unavailable selections', async () => {
  const { directory, content } = await createRepository()
  const profile = await initializeProjectProfile(directory, content, { agentIds: ['planner'] })

  assert.throws(() => resolveProfileSessionSelection(profile, undefined), /Choose an agent/)
  assert.throws(() => resolveProfileSessionSelection(profile, 'reviewer'), /not enabled/)
  assert.throws(
    () => resolveProfileSessionSelection(profile, 'planner', ['unknown']),
    /not enabled/
  )
})

test('profile changes are previewable, update defaults, and detect changed catalog content', async () => {
  const { directory, content } = await createRepository()
  await initializeProjectProfile(directory, content, { agentIds: ['planner', 'reviewer'] })
  const preview = await previewProjectProfileEntry(
    directory,
    content,
    'agents',
    'reviewer',
    'default'
  )
  assert.equal(
    (await readProjectProfile(directory)).agents.find(entry => entry.id === 'reviewer').mode,
    'enabled'
  )
  assert.equal(preview.agents.find(entry => entry.id === 'reviewer').mode, 'default')

  const updated = await updateProjectProfileEntry(
    directory,
    content,
    'agents',
    'reviewer',
    'default'
  )
  assert.equal(updated.agents.find(entry => entry.id === 'planner').mode, 'enabled')
  assert.equal(updated.agents.find(entry => entry.id === 'reviewer').mode, 'default')

  await writeFile(path.join(content, 'agents', 'reviewer.md'), 'Changed instructions.\n')
  const validation = await validateProjectProfile(directory, content)
  assert.equal(validation.valid, false)
  assert.match(validation.errors.join('\n'), /requires profile review: reviewer/)
})
