import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createRepositoryTools } from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-tools-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.git'))
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1\n')
  return root
}

function getTool(name, options) {
  const tool = createRepositoryTools(options).find(candidate => candidate.name === name)
  assert.ok(tool)
  return tool
}

function context(repositoryRoot, name, args) {
  return {
    repositoryRoot,
    sessionId: 'test-session',
    call: { id: `call-${name}`, name, arguments: args }
  }
}

test('lists, searches and reads repository text without generated directories', async () => {
  const root = await fixture()
  await mkdir(path.join(root, 'node_modules', 'hidden'), { recursive: true })
  await writeFile(path.join(root, 'node_modules', 'hidden', 'secret.txt'), 'needle\n')

  const listed = await getTool('list_files').execute(context(root, 'list_files', {}))
  const searched = await getTool('search_files').execute(
    context(root, 'search_files', { query: 'value' })
  )
  const read = await getTool('read_file').execute(
    context(root, 'read_file', { path: 'src/index.ts' })
  )

  assert.deepEqual(listed.files, ['src/index.ts'])
  assert.equal(searched.matches[0].path, 'src/index.ts')
  assert.equal(searched.matches[0].line, 1)
  assert.equal(read.content, 'export const value = 1\n')
  assert.match(read.sha256, /^[a-f0-9]{64}$/)
})

test('previews and writes files with hashes and a diff', async () => {
  const root = await fixture()
  const tool = getTool('write_file')
  const call = context(root, 'write_file', {
    path: 'src/generated.ts',
    content: 'export const generated = true\n'
  })

  const preview = await tool.preview(call)
  assert.equal(preview.operation, 'create')
  assert.match(preview.diff, /^--- \/dev\/null/m)

  const result = await tool.execute(call)
  assert.equal(result.afterHash, preview.afterHash)
  assert.equal(
    await readFile(path.join(root, 'src', 'generated.ts'), 'utf8'),
    call.call.arguments.content
  )
})

test('requires explicit overwrite and exact replacement disambiguation', async () => {
  const root = await fixture()
  const write = getTool('write_file')
  await assert.rejects(
    write.execute(context(root, 'write_file', { path: 'src/index.ts', content: 'changed\n' })),
    /overwrite=true/
  )

  await write.execute(
    context(root, 'write_file', {
      path: 'src/index.ts',
      content: 'changed changed\n',
      overwrite: true
    })
  )
  const replace = getTool('replace_in_file')
  await assert.rejects(
    replace.preview(
      context(root, 'replace_in_file', {
        path: 'src/index.ts',
        oldText: 'changed',
        newText: 'updated'
      })
    ),
    /not unique/
  )
  await replace.execute(
    context(root, 'replace_in_file', {
      path: 'src/index.ts',
      oldText: 'changed',
      newText: 'updated',
      replaceAll: true
    })
  )
  assert.equal(await readFile(path.join(root, 'src', 'index.ts'), 'utf8'), 'updated updated\n')
})

test('blocks traversal, protected audit files and escaping symlinks', async () => {
  const root = await fixture()
  const outside = await mkdtemp(path.join(tmpdir(), 'ordo-tools-outside-'))
  temporaryDirectories.push(outside)
  await writeFile(path.join(outside, 'secret.txt'), 'secret\n')
  await symlink(outside, path.join(root, 'external'))
  const read = getTool('read_file')
  const write = getTool('write_file')

  await assert.rejects(
    read.execute(context(root, 'read_file', { path: '../secret.txt' })),
    /escapes/
  )
  await assert.rejects(
    read.execute(context(root, 'read_file', { path: 'external/secret.txt' })),
    /symlink/
  )
  await assert.rejects(
    write.preview(
      context(root, 'write_file', { path: '.ordo/sessions/a.jsonl', content: 'tamper\n' })
    ),
    /Protected/
  )
})

test('runs commands without a shell and captures bounded output', async () => {
  const root = await fixture()
  const tool = getTool('run_command', { maxOutputBytes: 5 })
  const result = await tool.execute(
    context(root, 'run_command', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("abcdefgh")']
    })
  )

  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'abcde')
  assert.equal(result.stdoutTruncated, true)
  assert.equal(result.shell, false)
})
