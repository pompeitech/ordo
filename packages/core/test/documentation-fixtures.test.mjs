import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  detectPackageManager,
  detectStack,
  inspectRepository,
  loadCatalog,
  parseConfig,
  selectCatalogEntries,
  validateCatalog
} from '../dist/index.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testDirectory, '../../..')
const examplesRoot = path.join(repositoryRoot, 'examples')
const fixturesRoot = path.join(repositoryRoot, 'fixtures')

async function filesBelow(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(entryPath, extension)))
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

test('every example configuration satisfies the current schema and catalog IDs', async () => {
  const configPaths = await filesBelow(path.join(examplesRoot, 'configs'), '.json')
  const catalog = await loadCatalog(path.join(repositoryRoot, 'content'))

  assert.ok(configPaths.length > 0)
  for (const configPath of configPaths) {
    const config = parseConfig(await readJson(configPath))
    assert.equal(config.schemaVersion, 1, configPath)
    assert.ok(config.targets.length > 0, configPath)
    selectCatalogEntries(catalog, config.content ?? {})
  }
})

test('the example custom catalog is complete and valid', async () => {
  const catalog = await loadCatalog(path.join(examplesRoot, 'custom-catalog'))
  const validation = validateCatalog(catalog)

  assert.deepEqual(
    catalog.entries.map(entry => entry.kind),
    ['agents', 'rules', 'skills', 'workflows']
  )
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.issues, [])
})

test('catalog fixtures preserve valid and intentionally invalid behavior', async () => {
  const validCatalog = await loadCatalog(path.join(fixturesRoot, 'catalogs', 'valid'))
  const invalidCatalog = await loadCatalog(
    path.join(fixturesRoot, 'catalogs', 'invalid-missing-defense')
  )
  const validResult = validateCatalog(validCatalog)
  const invalidResult = validateCatalog(invalidCatalog)

  assert.equal(validResult.valid, true)
  assert.deepEqual(validResult.issues, [])
  assert.equal(invalidResult.valid, false)
  assert.deepEqual(
    invalidResult.issues.map(issue => issue.code),
    ['missing-prompt-defense']
  )
})

test('repository fixtures match their declared package-manager and stack outcomes', async () => {
  const fixtureRoot = path.join(fixturesRoot, 'repositories')
  const entries = await readdir(fixtureRoot, { withFileTypes: true })
  const directories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

  assert.ok(directories.length > 0)
  for (const directory of directories) {
    const repositoryPath = path.join(fixtureRoot, directory)
    const expected = await readJson(path.join(repositoryPath, 'expected.json'))
    const repository = await inspectRepository(repositoryPath)
    const packageManager = await detectPackageManager(repository)
    const stack = await detectStack(repository)

    assert.deepEqual(
      {
        status: packageManager.status,
        selected: packageManager.selected,
        version: packageManager.version,
        conflicts: [...packageManager.conflicts].sort()
      },
      {
        ...expected.packageManager,
        conflicts: [...expected.packageManager.conflicts].sort()
      },
      directory
    )
    assert.deepEqual(
      stack.technologies.map(technology => technology.id).sort(),
      [...expected.technologies].sort(),
      directory
    )
  }
})

test('safety-gate decision fixtures are unique and structurally valid', async () => {
  const fixturePath = path.join(fixturesRoot, 'decisions', 'safety-gate.jsonl')
  const records = (await readFile(fixturePath, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
  const ids = new Set()
  const severities = new Set(['low', 'medium', 'high', 'critical'])

  assert.ok(records.length > 0)
  for (const record of records) {
    assert.equal(typeof record.id, 'string')
    assert.ok(record.id.length > 0)
    assert.equal(ids.has(record.id), false, `Duplicate decision fixture id: ${record.id}`)
    ids.add(record.id)

    assert.equal(typeof record.input?.tool, 'string', record.id)
    assert.equal(typeof record.input?.arguments, 'object', record.id)
    assert.equal(typeof record.expected?.allow, 'boolean', record.id)
    assert.equal(severities.has(record.expected?.severity), true, record.id)
    assert.equal(Array.isArray(record.tags), true, record.id)
    assert.ok(record.tags.length > 0, record.id)
    assert.equal(
      record.tags.every(tag => typeof tag === 'string' && tag.length > 0),
      true,
      record.id
    )
  }
})

test('local links in repository guides resolve to existing paths', async () => {
  const markdownPaths = (
    await Promise.all(
      ['docs', 'examples', 'fixtures'].map(directory =>
        filesBelow(path.join(repositoryRoot, directory), '.md')
      )
    )
  ).flat()
  const missing = []

  for (const markdownPath of markdownPaths) {
    const content = await readFile(markdownPath, 'utf8')
    const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)
    for (const match of links) {
      const target = match[1]
      if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
        continue
      }

      const relativeTarget = decodeURIComponent(target.split('#')[0])
      const resolved = path.resolve(path.dirname(markdownPath), relativeTarget)
      try {
        await stat(resolved)
      } catch {
        missing.push(`${path.relative(repositoryRoot, markdownPath)} -> ${target}`)
      }
    }
  }

  assert.deepEqual(missing, [])
})

test('the CI example is valid Bash syntax when Bash is available', t => {
  const scriptPath = path.join(examplesRoot, 'ci', 'verify-ordo.sh')
  const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') {
    t.skip('Bash is not available')

    return
  }

  assert.equal(result.status, 0, result.stderr)
})
