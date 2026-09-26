import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  describeFileChange,
  parseSnapshotLocation,
  rejectedFiles,
  reviewFileItems
} from '../dist/code-review-model.js'

const files = [
  { path: 'src/checkout.ts', change: 'modified', additions: 2, deletions: 1 },
  { path: 'src/logo.png', change: 'added' },
  { path: 'src/legacy.ts', change: 'deleted', additions: 0, deletions: 4 }
]

test('each changed file becomes a review item with its kind and line counts', () => {
  assert.deepEqual(
    reviewFileItems(files).map(item => [item.label, item.description]),
    [
      ['$(diff-modified) src/checkout.ts', 'modified · +2 −1'],
      ['$(diff-added) src/logo.png', 'added · binary'],
      ['$(diff-removed) src/legacy.ts', 'deleted · +0 −4']
    ]
  )
  assert.equal(describeFileChange(files[0]), 'modified · +2 −1')
})

test('unchecked files are the ones to undo', () => {
  assert.deepEqual(rejectedFiles(files, ['src/checkout.ts']), ['src/logo.png', 'src/legacy.ts'])
  assert.deepEqual(
    rejectedFiles(
      files,
      files.map(file => file.path)
    ),
    []
  )
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
