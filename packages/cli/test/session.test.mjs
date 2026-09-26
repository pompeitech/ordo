import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { runCli } from '../dist/program.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function captureOutput() {
  let output = ''
  return { read: () => output, write: chunk => (output += chunk) }
}

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-session-'))
  temporaryDirectories.push(directory)
  await mkdir(path.join(directory, '.git'))
  await writeFile(path.join(directory, 'package.json'), '{"name":"session-fixture"}\n')
  return directory
}

async function createContentCatalog(directory) {
  const root = path.join(directory, 'team-content')
  await mkdir(path.join(root, 'agents'), { recursive: true })
  await mkdir(path.join(root, 'skills', 'release'), { recursive: true })
  await mkdir(path.join(root, 'rules'), { recursive: true })
  await writeFile(
    path.join(root, 'agents', 'planner.md'),
    '---\nname: planner\ndescription: Project planner\n---\n\nPlanner instructions.\n'
  )
  await writeFile(
    path.join(root, 'skills', 'release', 'SKILL.md'),
    '---\nname: release\ndescription: Release skill\n---\n\nRelease procedure.\n'
  )
  await writeFile(
    path.join(root, 'rules', 'common-safety.md'),
    '---\nname: common-safety\ndescription: Shared safety rule\n---\n\nProtect secrets.\n'
  )
  return root
}

async function execute(args, directory, dependencies = {}) {
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(args, {
    cwd: directory,
    stdout,
    stderr,
    env: {},
    ...dependencies
  })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

test('session commands create, list, show, and export persistent records', async () => {
  const repository = await createRepository()
  const created = await execute(
    [
      'session',
      'create',
      '--title',
      'Implement sessions',
      '--provider',
      'openai',
      '--model',
      'example-model',
      '--context-snapshot',
      'snapshot-1',
      '--json'
    ],
    repository
  )
  const createdReport = JSON.parse(created.stdout)
  const listed = JSON.parse((await execute(['session', 'list', '--json'], repository)).stdout)
  const shown = JSON.parse(
    (await execute(['session', 'show', createdReport.session.id, '--json'], repository)).stdout
  )
  const exported = JSON.parse(
    (await execute(['session', 'export', createdReport.session.id, '--json'], repository)).stdout
  )

  assert.equal(created.exitCode, 0)
  assert.equal(createdReport.session.runtime.provider, 'openai')
  assert.equal(listed.sessions.length, 1)
  assert.equal(shown.session.id, createdReport.session.id)
  assert.deepEqual(exported.events, [])
})

test('session run snapshots context and executes an OpenAI streaming turn', async () => {
  const repository = await createRepository()
  await execute(['context', 'init'], repository)
  const created = JSON.parse(
    (
      await execute(
        [
          'session',
          'create',
          '--title',
          'Run provider',
          '--provider',
          'openai',
          '--model',
          'test-model',
          '--json'
        ],
        repository
      )
    ).stdout
  )
  const fetch = async () =>
    new Response(
      [
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Completed' })}`,
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            status: 'completed',
            usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 }
          }
        })}`,
        ''
      ].join('\n\n'),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  const run = await execute(
    ['session', 'run', created.session.id, '--prompt', 'Do the work', '--json'],
    repository,
    { env: { OPENAI_API_KEY: 'test-key' }, fetch }
  )
  const report = JSON.parse(run.stdout)

  assert.equal(run.exitCode, 0)
  assert.equal(report.command, 'session-run')
  assert.equal(report.text, 'Completed')
  assert.equal(report.usage.totalTokens, 6)
  assert.equal(report.session.contextSnapshotId, report.contextSnapshotId)
})

test('session command validates runtime pairs and exposes help', async () => {
  const repository = await createRepository()
  const invalid = await execute(
    ['session', 'create', '--title', 'Invalid', '--provider', 'openai'],
    repository
  )
  const help = await execute(['session', '--help'], repository)

  assert.equal(invalid.exitCode, 2)
  assert.match(invalid.stderr, /--provider and --model/)
  assert.equal(help.exitCode, 0)
  assert.match(help.stdout, /provider-neutral/)
})

test('profile CLI initializes shared selections and records them on sessions', async () => {
  const repository = await createRepository()
  const contentRoot = await createContentCatalog(repository)
  const profile = await execute(
    [
      'profile',
      'init',
      '--content-root',
      contentRoot,
      '--default-agent',
      'planner',
      '--skill',
      'release',
      '--json'
    ],
    repository
  )
  const profileReport = JSON.parse(profile.stdout)
  const created = await execute(
    [
      'session',
      'create',
      '--title',
      'Implement release flow',
      '--provider',
      'openai',
      '--model',
      'test-model',
      '--content-root',
      contentRoot,
      '--skill',
      'release',
      '--json'
    ],
    repository
  )
  const session = JSON.parse(created.stdout).session
  let requestBody
  const fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body)
    return new Response(
      [
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Done' })}`,
        `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed' } })}`,
        ''
      ].join('\n\n'),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }
  const run = await execute(
    [
      'session',
      'run',
      session.id,
      '--prompt',
      'Implement it',
      '--content-root',
      contentRoot,
      '--json'
    ],
    repository,
    { env: { OPENAI_API_KEY: 'test-key' }, fetch }
  )
  const validation = JSON.parse(
    (await execute(['profile', 'validate', '--content-root', contentRoot, '--json'], repository))
      .stdout
  )

  assert.equal(profile.exitCode, 0)
  assert.equal(profileReport.profile.agents[0].mode, 'default')
  assert.equal(created.exitCode, 0)
  assert.equal(session.profileSelection.agent.id, 'planner')
  assert.deepEqual(
    session.profileSelection.skills.map(entry => entry.id),
    ['release']
  )
  assert.deepEqual(
    session.profileSelection.rules.map(entry => entry.id),
    ['common-safety']
  )
  assert.equal(session.profileSelection.profileSha256.length, 64)
  assert.equal(run.exitCode, 0, run.stderr)
  const transmitted = JSON.stringify(requestBody.input)
  assert.match(transmitted, /Planner instructions\./)
  assert.match(transmitted, /Release procedure\./)
  assert.match(transmitted, /Protect secrets\./)
  assert.equal(JSON.parse(run.stdout).text, 'Done')
  assert.equal(validation.valid, true)
})

test('session run refuses catalog content changed after session creation', async () => {
  const repository = await createRepository()
  const contentRoot = await createContentCatalog(repository)
  await execute(
    ['profile', 'init', '--content-root', contentRoot, '--default-agent', 'planner', '--json'],
    repository
  )
  const created = JSON.parse(
    (
      await execute(
        [
          'session',
          'create',
          '--title',
          'Pinned profile',
          '--provider',
          'openai',
          '--model',
          'test-model',
          '--content-root',
          contentRoot,
          '--json'
        ],
        repository
      )
    ).stdout
  )
  await writeFile(
    path.join(contentRoot, 'agents', 'planner.md'),
    '---\nname: planner\n---\nChanged instructions.\n'
  )
  let providerCalled = false
  const result = await execute(
    [
      'session',
      'run',
      created.session.id,
      '--prompt',
      'Run',
      '--content-root',
      contentRoot,
      '--json'
    ],
    repository,
    {
      env: { OPENAI_API_KEY: 'test-key' },
      fetch: async () => {
        providerCalled = true
        throw new Error('unexpected provider call')
      }
    }
  )
  assert.equal(result.exitCode, 1)
  assert.match(result.stderr, /catalog entry requires profile review/)
  assert.equal(providerCalled, false)
})

test('profile set supports dry-run and rejects agent choices outside the shared profile', async () => {
  const repository = await createRepository()
  const contentRoot = await createContentCatalog(repository)
  await execute(
    ['profile', 'init', '--content-root', contentRoot, '--agent', 'planner', '--json'],
    repository
  )
  const dryRun = await execute(
    ['profile', 'set', 'agents', 'planner', '--mode', 'default', '--dry-run', '--json'],
    repository
  )
  const created = await execute(
    [
      'session',
      'create',
      '--title',
      'Bad selection',
      '--agent',
      'not-allowed',
      '--content-root',
      contentRoot,
      '--json'
    ],
    repository
  )

  assert.equal(JSON.parse(dryRun.stdout).dryRun, true)
  assert.equal(
    (await readFile(path.join(repository, '.ordo', 'profile.json'), 'utf8')).includes(
      '"mode": "enabled"'
    ),
    true
  )
  assert.equal(created.exitCode, 1)
  assert.match(created.stderr, /not enabled by the project profile/)
})
