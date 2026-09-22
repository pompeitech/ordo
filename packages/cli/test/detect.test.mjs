import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  return {
    read: () => output,
    write: chunk => {
      output += chunk
    }
  }
}

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-detect-'))
  temporaryDirectories.push(directory)
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'example-service',
      packageManager: 'pnpm@10.0.0',
      dependencies: { fastify: '5.0.0', mongodb: '6.0.0' },
      devDependencies: { typescript: '5.9.0', vitest: '3.0.0' }
    })
  )
  await writeFile(path.join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  await writeFile(path.join(directory, 'package-lock.json'), '{}\n')
  await writeFile(path.join(directory, 'AGENTS.md'), '# Repository instructions\n')

  return directory
}

async function execute(args, cwd) {
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(args, { cwd, stdout, stderr })

  return {
    exitCode,
    stdout: stdout.read(),
    stderr: stderr.read()
  }
}

test('detect emits a stable JSON report with evidence', async () => {
  const directory = await createRepository()
  const result = await execute(['detect', directory, '--json'], directory)
  const report = JSON.parse(result.stdout)

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.command, 'detect')
  assert.equal(report.repository.rootDirectory, directory)
  assert.equal(report.repository.name, 'example-service')
  assert.equal(report.packageManager.selected, 'pnpm')
  assert.deepEqual(report.packageManager.conflicts, ['npm'])
  assert.deepEqual(
    report.stack.technologies.map(technology => technology.id),
    ['mongodb', 'fastify', 'typescript', 'vitest', 'nodejs'].sort((left, right) => {
      const categories = {
        mongodb: 'database',
        fastify: 'framework',
        typescript: 'language',
        vitest: 'testing',
        nodejs: 'runtime'
      }

      return `${categories[left]}:${left}`.localeCompare(`${categories[right]}:${right}`)
    })
  )
  assert.equal(report.harnesses.find(harness => harness.adapter === 'codex').detected, true)
  assert.equal(report.harnesses.find(harness => harness.adapter === 'claude').detected, false)
})

test('detect renders a readable console report', async () => {
  const directory = await createRepository()
  const result = await execute(['detect', directory], directory)

  assert.equal(result.exitCode, 0)
  assert.equal(result.stderr, '')
  assert.match(result.stdout, /^◆ ORDO \/\/ REPOSITORY DETECTION/m)
  assert.match(result.stdout, /project\s+example-service/)
  assert.match(result.stdout, /package manager\s+pnpm@10\.0\.0/)
  assert.match(result.stdout, /conflicts\s+npm/)
  assert.match(result.stdout, /◆ Fastify\s+framework/)
  assert.match(result.stdout, /● codex\s+DETECTED/)
  assert.match(result.stdout, /○ claude\s+NOT DETECTED/)
})

test('detect resolves the repository from the current directory', async () => {
  const directory = await createRepository()
  const nestedDirectory = path.join(directory, 'src', 'features')
  await mkdir(nestedDirectory, { recursive: true })

  const result = await execute(['detect', '--json'], nestedDirectory)
  const report = JSON.parse(result.stdout)

  assert.equal(result.exitCode, 0)
  assert.equal(report.repository.rootDirectory, directory)
})

test('help and version return without inspecting a repository', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-help-'))
  temporaryDirectories.push(directory)

  const help = await execute(['--help'], directory)
  const version = await execute(['--version'], directory)

  assert.equal(help.exitCode, 0)
  assert.match(help.stdout, /Usage: ordo detect \[directory\] \[--json\]/)
  assert.equal(version.exitCode, 0)
  assert.equal(version.stdout, '1.0.0\n')
})

test('unknown commands return a usage error', async () => {
  const directory = await createRepository()
  const result = await execute(['unknown'], directory)

  assert.equal(result.exitCode, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Unknown command: unknown/)
  assert.match(result.stderr, /ordo --help/)
})

test('detection failures return a structured operational error', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-cli-empty-'))
  temporaryDirectories.push(directory)
  const result = await execute(['detect'], directory)

  assert.equal(result.exitCode, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /^REPOSITORY_NOT_FOUND: Repository not found from:/)
})
