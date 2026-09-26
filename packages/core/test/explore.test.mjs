import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  addExploreAlternative,
  createExplore,
  linkExploreSpec,
  listExplores,
  readExplore,
  selectExploreAlternative
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(temporaryDirectories.map(root => rm(root, { recursive: true, force: true })))
})

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-explore-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  return root
}

test('persists divergence, explicit selection, and crystallization', async () => {
  const root = await repository()
  const exploration = await createExplore(root, {
    title: 'Checkout design',
    problem: 'Choose a checkout consistency model.',
    assumptions: ['Payments can be retried'],
    openQuestions: ['What is the latency budget?']
  })
  await addExploreAlternative(root, exploration.id, {
    id: 'saga',
    title: 'Saga',
    summary: 'Coordinate local transactions with compensation.',
    benefits: ['Independent services'],
    tradeoffs: ['Eventual consistency'],
    risks: ['Compensation gaps']
  })
  await addExploreAlternative(root, exploration.id, {
    id: 'transaction',
    title: 'Single transaction',
    summary: 'Keep checkout in one transactional boundary.',
    tradeoffs: ['Tighter coupling']
  })
  const selected = await selectExploreAlternative(root, exploration.id, 'saga')
  const linked = await linkExploreSpec(root, exploration.id, 'checkout-spec')

  assert.equal(selected.status, 'converging')
  assert.equal(selected.selectedAlternativeId, 'saga')
  assert.equal(linked.status, 'crystallized')
  assert.equal(linked.specId, 'checkout-spec')
  assert.equal((await readExplore(root, exploration.id)).alternatives.length, 2)
  assert.equal((await listExplores(root)).length, 1)
})

test('refuses unknown selections and changes after crystallization', async () => {
  const root = await repository()
  const exploration = await createExplore(root, { title: 'Storage', problem: 'Choose storage.' })
  await assert.rejects(selectExploreAlternative(root, exploration.id, 'missing'), /not found/)
  await addExploreAlternative(root, exploration.id, {
    title: 'Relational',
    summary: 'Use relational storage.',
    tradeoffs: ['Schema migrations']
  })
  await selectExploreAlternative(root, exploration.id, 'relational')
  await linkExploreSpec(root, exploration.id, 'storage-spec')
  await assert.rejects(
    addExploreAlternative(root, exploration.id, {
      title: 'Document',
      summary: 'Use documents.',
      tradeoffs: ['Weaker joins']
    }),
    /Cannot add alternatives/
  )
})
