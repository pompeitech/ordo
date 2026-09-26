import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  createPlan,
  createSession,
  createSpec,
  finishPlanStep,
  readAuditEvents,
  readPlan,
  recordRunSnapshot,
  reviewAgentStep,
  startPlanStep,
  stepChanges,
  updateSpecStatus
} from '../dist/index.js'

delete process.env.ORDO_ACTOR
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

async function createRepository({ withGit = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-changes-'))
  temporaryDirectories.push(root)
  if (withGit) {
    git(root, 'init', '-q')
    git(root, 'config', 'user.name', 'Ada Lovelace')
    git(root, 'config', 'user.email', 'ada@example.com')
    git(root, 'config', 'commit.gpgsign', 'false')
  } else {
    await mkdir(path.join(root, '.git'))
  }
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'checkout.ts'), 'export const total = 1\n')
  await writeFile(path.join(root, 'src', 'notes.ts'), 'export const notes = []\n')
  await writeFile(path.join(root, 'src', 'legacy.ts'), 'export const legacy = true\n')
  if (withGit) {
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'Initial')
  }
  const spec = await createSpec(root, {
    title: 'Safe checkout',
    objective: 'Reject invalid payments.',
    acceptanceCriteria: '- Invalid cards are rejected.'
  })
  await updateSpecStatus(root, spec.id, 'ready')
  const plan = await createPlan(root, {
    title: 'Safe checkout implementation',
    specId: spec.id,
    steps: [
      {
        id: 'validate',
        description: 'Validate payments',
        expectedOutput: 'Validator',
        verification: ['pnpm test']
      }
    ]
  })
  return { root, planId: plan.id }
}

// What `ordo agent` does around a run, with the agent's edits simulated.
async function agentRun(root, planId, edit) {
  const session = await createSession(root, { title: 'Agent run' })
  await startPlanStep(root, planId, 'validate', session.id)
  await recordRunSnapshot(root, session.id, 'before')
  await edit()
  await recordRunSnapshot(root, session.id, 'after')
  await finishPlanStep(root, planId, 'validate', 'paused', { actorType: 'system' })
  return session
}

const agentEdits = root => async () => {
  await writeFile(
    path.join(root, 'src', 'checkout.ts'),
    'export const total = 2\nexport const cvv = 3\n'
  )
  await writeFile(path.join(root, 'src', 'validator.ts'), 'export function validate() {}\n')
  await unlink(path.join(root, 'src', 'legacy.ts'))
}

test('only the files the agent changed are listed, without touching the Git index', async () => {
  const { root, planId } = await createRepository()
  // The developer's own uncommitted work, present before the agent started.
  await writeFile(path.join(root, 'src', 'notes.ts'), 'export const notes = ["mine"]\n')
  git(root, 'add', 'src/notes.ts')
  const stagedBefore = git(root, 'diff', '--cached', '--name-only')

  const session = await agentRun(root, planId, agentEdits(root))
  const changes = await stepChanges(root, await readPlan(root, planId), 'validate')

  assert.equal(changes.available, true)
  assert.equal(changes.sessionId, session.id)
  assert.deepEqual(
    changes.files.map(file => [file.path, file.change, file.additions, file.deletions]),
    [
      ['src/checkout.ts', 'modified', 2, 1],
      ['src/legacy.ts', 'deleted', 0, 1],
      ['src/validator.ts', 'added', 1, 0]
    ]
  )
  assert.ok(changes.files.every(file => !file.path.startsWith('.ordo/')))
  assert.equal(git(root, 'diff', '--cached', '--name-only'), stagedBefore)
  assert.match(git(root, 'show-ref'), new RegExp(`refs/ordo/snapshots/${session.id}-before`))
})

test('rejected files go back to their version from before the run; the review records both lists', async () => {
  const { root, planId } = await createRepository()
  await agentRun(root, planId, agentEdits(root))

  await reviewAgentStep(root, planId, 'validate', 'changes-requested', {
    note: 'Keep the legacy module and the old total',
    rejectFiles: ['src/checkout.ts', 'src/legacy.ts']
  })

  assert.equal(
    await readFile(path.join(root, 'src', 'checkout.ts'), 'utf8'),
    'export const total = 1\n'
  )
  assert.equal(
    await readFile(path.join(root, 'src', 'legacy.ts'), 'utf8'),
    'export const legacy = true\n'
  )
  await access(path.join(root, 'src', 'validator.ts'))
  const [review] = (await readAuditEvents(root, 'plan', planId)).filter(
    event => event.action === 'reviewed'
  )
  assert.deepEqual(review.files, {
    accepted: ['src/validator.ts'],
    rejected: ['src/checkout.ts', 'src/legacy.ts']
  })
  assert.equal((await readPlan(root, planId)).steps[0].status, 'pending')
})

test('an added file that is rejected is removed', async () => {
  const { root, planId } = await createRepository()
  await agentRun(root, planId, agentEdits(root))

  await reviewAgentStep(root, planId, 'validate', 'approved', { rejectFiles: ['src/validator.ts'] })

  await assert.rejects(access(path.join(root, 'src', 'validator.ts')), { code: 'ENOENT' })
  assert.equal((await readPlan(root, planId)).steps[0].status, 'completed')
})

test('a file edited after the run blocks the undo: nothing is restored or recorded', async () => {
  const { root, planId } = await createRepository()
  await agentRun(root, planId, agentEdits(root))
  await writeFile(path.join(root, 'src', 'checkout.ts'), 'export const total = 99 // my fix\n')

  await assert.rejects(
    reviewAgentStep(root, planId, 'validate', 'approved', {
      rejectFiles: ['src/checkout.ts', 'src/validator.ts']
    }),
    /Edited after the agent finished, nothing was undone: src\/checkout.ts/
  )

  assert.equal(
    await readFile(path.join(root, 'src', 'checkout.ts'), 'utf8'),
    'export const total = 99 // my fix\n'
  )
  await access(path.join(root, 'src', 'validator.ts'))
  assert.equal((await readPlan(root, planId)).steps[0].status, 'paused')
  assert.deepEqual(
    (await readAuditEvents(root, 'plan', planId)).filter(event => event.action === 'reviewed'),
    []
  )
})

test('only files the agent changed can be undone', async () => {
  const { root, planId } = await createRepository()
  await agentRun(root, planId, agentEdits(root))

  await assert.rejects(
    reviewAgentStep(root, planId, 'validate', 'approved', { rejectFiles: ['src/notes.ts'] }),
    /did not change this file/
  )
})

test('outside Git the step can still be reviewed, just without a diff', async () => {
  const { root, planId } = await createRepository({ withGit: false })
  await agentRun(root, planId, agentEdits(root))

  const changes = await stepChanges(root, await readPlan(root, planId), 'validate')
  assert.equal(changes.available, false)
  assert.match(changes.reason, /no workspace snapshots/)
  await assert.rejects(
    reviewAgentStep(root, planId, 'validate', 'approved', { rejectFiles: ['src/checkout.ts'] }),
    /Cannot undo files/
  )
  await reviewAgentStep(root, planId, 'validate', 'approved')
  assert.equal((await readPlan(root, planId)).steps[0].status, 'completed')
})
