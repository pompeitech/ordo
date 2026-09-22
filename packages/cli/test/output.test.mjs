import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { formatInstallReport } from '../dist/output/console.js'
import { formatLogo } from '../dist/output/theme.js'
import { runCli } from '../dist/program.js'

const ANSI_PATTERN = /\u001B\[/
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function captureOutput(isTTY) {
  let output = ''

  return {
    isTTY,
    read: () => output,
    write: chunk => {
      output += chunk
    }
  }
}

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-output-'))
  temporaryDirectories.push(directory)
  await writeFile(path.join(directory, 'package.json'), '{"name":"output-fixture"}\n')

  return directory
}

test('logo preserves the approved wordmark and central block', () => {
  const logo = formatLogo()

  assert.match(logo, /^   ██████╗        ██████╗ ██████╗ ██████╗  ██████╗/)
  assert.match(logo, /██║ █ ██║/)
  assert.match(logo, /ORDER · CONTROL/)
  assert.match(logo, /VERIFY · REPEAT/)
  assert.doesNotMatch(logo, ANSI_PATTERN)
})

test('human output uses ANSI styling when stdout is an interactive terminal', async () => {
  const directory = await createRepository()
  const stdout = captureOutput(true)
  const stderr = captureOutput(true)

  const exitCode = await runCli(['detect', directory], {
    cwd: directory,
    stdout,
    stderr,
    env: {}
  })

  assert.equal(exitCode, 0)
  assert.match(stdout.read(), ANSI_PATTERN)
  assert.match(stdout.read(), /ORDER · CONTROL/)
  assert.match(stdout.read(), /◆ ORDO/)
  assert.equal(stderr.read(), '')
})

test('NO_COLOR disables ANSI styling even on an interactive terminal', async () => {
  const directory = await createRepository()
  const stdout = captureOutput(true)

  await runCli(['detect', directory], {
    cwd: directory,
    stdout,
    stderr: captureOutput(true),
    env: { NO_COLOR: '1' }
  })

  assert.doesNotMatch(stdout.read(), ANSI_PATTERN)
  assert.match(stdout.read(), /^   ██████╗/)
  assert.match(stdout.read(), /^◆ ORDO \/\/ REPOSITORY DETECTION/m)
})

test('FORCE_COLOR enables ANSI styling for non-interactive human output', async () => {
  const directory = await createRepository()
  const stdout = captureOutput(false)

  await runCli(['detect', directory], {
    cwd: directory,
    stdout,
    stderr: captureOutput(false),
    env: { FORCE_COLOR: '1' }
  })

  assert.match(stdout.read(), ANSI_PATTERN)
})

test('JSON output never contains ANSI escape sequences', async () => {
  const directory = await createRepository()
  const stdout = captureOutput(true)

  await runCli(['detect', directory, '--json'], {
    cwd: directory,
    stdout,
    stderr: captureOutput(true),
    env: { FORCE_COLOR: '1' }
  })

  assert.doesNotMatch(stdout.read(), ANSI_PATTERN)
  assert.doesNotMatch(stdout.read(), /ORDER · CONTROL/)
  assert.equal(JSON.parse(stdout.read()).command, 'detect')
})

test('operational errors are highlighted on an interactive terminal', async () => {
  const directory = await createRepository()
  const stderr = captureOutput(true)

  const exitCode = await runCli(['unknown'], {
    cwd: directory,
    stdout: captureOutput(true),
    stderr,
    env: {}
  })

  assert.equal(exitCode, 2)
  assert.match(stderr.read(), ANSI_PATTERN)
  assert.match(stderr.read(), /× Unknown command: unknown/)
})

test('installation output provides state-aware next steps', () => {
  const baseReport = {
    schemaVersion: 1,
    command: 'install',
    repositoryRoot: '/project',
    configPath: '/project/ordo.config.json',
    contentRoot: '/catalog',
    targets: ['claude', 'codex'],
    installed: true,
    actions: [],
    conflicts: [],
    warnings: [],
    summary: { created: 0, updated: 0, removed: 0, skipped: 0, conflicts: 0 }
  }

  const installed = formatInstallReport({ ...baseReport, dryRun: false })
  const dryRun = formatInstallReport({ ...baseReport, installed: false, dryRun: true })
  const blocked = formatInstallReport({
    ...baseReport,
    installed: false,
    dryRun: false,
    conflicts: [{ code: 'unmanaged-file', message: 'Conflict', path: 'AGENTS.md' }],
    summary: { ...baseReport.summary, conflicts: 1 }
  })

  assert.match(installed, /ordo doctor/)
  assert.match(installed, /claude/)
  assert.match(installed, /codex/)
  assert.match(dryRun, /Apply this plan with:/)
  assert.match(dryRun, /ordo install/)
  assert.match(blocked, /Resolve the conflicts listed above/)
})
