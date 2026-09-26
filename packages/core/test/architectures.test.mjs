import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  approveArchitectureProposal,
  createArchitectureProposal,
  createSpec,
  listArchitectureProposals,
  previewArchitectureApproval,
  previewArchitectureProposal,
  readArchitectureProposal
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-architectures-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  await createSpec(root, {
    title: 'Safe checkout',
    objective: 'Let a customer complete checkout safely.',
    acceptanceCriteria: '- A valid order is persisted.'
  })
  return root
}

const proposal = {
  title: 'Checkout architecture',
  specId: 'safe-checkout',
  impact: ['orders module'],
  components: [
    { name: 'OrderService', responsibility: 'Persist orders', changes: ['add validation'] }
  ],
  contracts: ['POST /orders returns 201'],
  decisions: ['Use optimistic locking']
}

test('architecture proposals are previewed, persisted, listed, and approved', async () => {
  const root = await repository()
  const target = path.join(root, '.ordo', 'architectures', 'checkout-architecture.json')

  const preview = await previewArchitectureProposal(root, proposal)
  assert.equal(preview.status, 'proposed')
  await assert.rejects(access(target))

  const created = await createArchitectureProposal(root, proposal)
  assert.equal(created.id, 'checkout-architecture')
  assert.deepEqual(created.risks, [])
  await access(target)
  await assert.rejects(createArchitectureProposal(root, proposal), /already exists/)

  const approvalPreview = await previewArchitectureApproval(root, created.id)
  assert.equal(approvalPreview.status, 'approved')
  assert.equal((await readArchitectureProposal(root, created.id)).status, 'proposed')

  const approved = await approveArchitectureProposal(root, created.id)
  assert.equal(approved.status, 'approved')
  assert.equal(typeof approved.approvedAt, 'string')
  assert.equal((await listArchitectureProposals(root)).length, 1)
  await assert.rejects(approveArchitectureProposal(root, created.id), /cannot be approved/)
})

test('architecture proposals require an existing spec and complete content', async () => {
  const root = await repository()
  await assert.rejects(
    createArchitectureProposal(root, { ...proposal, specId: 'missing' }),
    error => error.code === 'SPEC_NOT_FOUND'
  )
  await assert.rejects(
    createArchitectureProposal(root, { ...proposal, components: [] }),
    error => error.code === 'ARCHITECTURE_INVALID'
  )
  await assert.rejects(
    readArchitectureProposal(root, 'unknown'),
    error => error.code === 'ARCHITECTURE_NOT_FOUND'
  )
  assert.deepEqual(await listArchitectureProposals(root), [])
})
