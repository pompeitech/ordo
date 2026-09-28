import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeFileChange, parseSnapshotLocation } from '../dist/code-review-model.js'

const files = [
  { path: 'src/checkout.ts', change: 'modified', additions: 2, deletions: 1 },
  { path: 'src/logo.png', change: 'added' },
  { path: 'src/legacy.ts', change: 'deleted', additions: 0, deletions: 4 }
]

test('a changed file is described by its kind and line counts', () => {
  assert.equal(describeFileChange(files[0]), 'modified · +2 −1')
  assert.equal(describeFileChange(files[1]), 'added · binary')
})

test('snapshot locations accept only a tree id and a path inside the repository', () => {
  const tree = 'a'.repeat(40)
  assert.deepEqual(parseSnapshotLocation('/src/checkout.ts', `tree=${tree}`), {
    tree,
    file: 'src/checkout.ts'
  })
  assert.equal(parseSnapshotLocation('/src/checkout.ts', 'tree=HEAD'), undefined)
  assert.equal(parseSnapshotLocation('/../secret', `tree=${tree}`), undefined)
  assert.equal(parseSnapshotLocation('/', `tree=${tree}`), undefined)
})
