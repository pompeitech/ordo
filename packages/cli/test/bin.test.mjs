import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)
const temporaryDirectories = []
const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(testDirectory, '..')

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

test('package bin points to the dedicated executable entrypoint', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))

  assert.equal(manifest.bin.ordo, 'dist/bin.js')
  assert.match(
    await readFile(path.join(packageRoot, 'dist', 'bin.js'), 'utf8'),
    /^#!\/usr\/bin\/env node/
  )
})

test('compiled CLI executes when Node receives a symlinked bin path', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-bin-'))
  temporaryDirectories.push(directory)
  const linkedBin = path.join(directory, 'ordo')
  await symlink(path.join(packageRoot, 'dist', 'bin.js'), linkedBin)

  const result = await executeFile(process.execPath, [linkedBin, '--version'])

  assert.equal(result.stderr, '')
  assert.equal(result.stdout, '1.0.0\n')
})

test('global options without a command are reported as options', async () => {
  const result = await executeFile(process.execPath, [
    path.join(packageRoot, 'dist', 'bin.js'),
    '-j'
  ]).catch(error => error)

  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Unknown option: -j/)
  assert.match(result.stderr, /Run "ordo --help" for usage\./)
})
