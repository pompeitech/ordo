import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadCatalog, validateCatalog } from '../dist/index.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(testDirectory, '../../..')

test('repository content catalog is valid', async () => {
  const catalog = await loadCatalog(path.join(repositoryRoot, 'content'))
  const validation = validateCatalog(catalog)

  assert.deepEqual(validation.issues, [])
  assert.equal(validation.valid, true)
})
