import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)
const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

test('packaged CLI runs with bundled runtime and content outside the workspace', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-package-'))
  temporaryDirectories.push(directory)
  const packageDirectory = path.join(directory, 'package')
  const targetDirectory = path.join(directory, 'target')
  await cp(path.resolve(import.meta.dirname, '../dist'), path.join(packageDirectory, 'dist'), {
    recursive: true
  })
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    '{"name":"@pompeitech/ordo","version":"1.0.0","type":"module"}\n'
  )
  await mkdir(targetDirectory, { recursive: true })
  await writeFile(
    path.join(targetDirectory, 'package.json'),
    '{"name":"standalone-target","private":true}\n'
  )

  const binary = path.join(packageDirectory, 'dist', 'bin.js')
  const initialized = await executeFile(
    process.execPath,
    [binary, 'init', targetDirectory, '--yes', '--adapter', 'codex', '--json'],
    { cwd: targetDirectory }
  )
  const installed = await executeFile(
    process.execPath,
    [binary, 'install', targetDirectory, '--dry-run', '--json'],
    { cwd: targetDirectory }
  )
  const config = JSON.parse(await readFile(path.join(targetDirectory, 'ordo.config.json'), 'utf8'))

  assert.equal(JSON.parse(initialized.stdout).command, 'init')
  assert.equal(config.contentRoot, await realpath(path.join(packageDirectory, 'dist', 'content')))
  assert.ok(JSON.parse(installed.stdout).summary.created > 0)
})

test('published package has no runtime dependencies', async () => {
  const manifest = JSON.parse(
    await readFile(path.resolve(import.meta.dirname, '../package.json'), 'utf8')
  )

  assert.equal(manifest.name, '@pompeitech/ordo')
  assert.equal(manifest.version, '1.0.0')
  assert.deepEqual(manifest.dependencies ?? {}, {})
  assert.deepEqual(manifest.files, ['dist/bin.js', 'dist/content'])
  assert.equal(manifest.main, undefined)
})
