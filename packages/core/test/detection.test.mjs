import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  detectHarnesses,
  detectPackageManager,
  detectStack,
  inspectRepository
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

test('repository detection is deterministic and evidence-backed', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-detect-'))
  temporaryDirectories.push(directory)
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      packageManager: 'pnpm@10.0.0',
      dependencies: { fastify: '5.0.0', mongodb: '6.0.0' },
      devDependencies: { typescript: '5.9.0', vitest: '3.0.0' }
    })
  )
  await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  await writeFile(path.join(directory, 'package-lock.json'), '{}\n')
  await writeFile(path.join(directory, 'AGENTS.md'), '# Instructions\n')

  const repository = await inspectRepository(directory)
  const packageManager = await detectPackageManager(repository)
  const stack = await detectStack(repository)
  const harnesses = await detectHarnesses(repository)

  assert.equal(packageManager.selected, 'pnpm')
  assert.deepEqual(packageManager.conflicts, ['npm'])
  assert.deepEqual(stack.technologies.map(technology => technology.id).sort(), [
    'fastify',
    'mongodb',
    'nodejs',
    'typescript',
    'vitest'
  ])
  assert.equal(harnesses.find(harness => harness.adapter === 'codex')?.detected, true)
  assert.equal(harnesses.find(harness => harness.adapter === 'claude')?.detected, false)
})
