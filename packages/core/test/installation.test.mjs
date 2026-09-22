import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  EMPTY_INSTALLATION_STATE,
  install,
  loadInstallationState,
  planInstallation
} from '../dist/index.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

test('installer writes owned files and protects user modifications', async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ordo-install-'))
  temporaryDirectories.push(repositoryRoot)
  const targetRoot = path.join(repositoryRoot, '.codex')
  await mkdir(targetRoot, { recursive: true })
  const targets = [
    {
      target: { adapter: 'codex', rootDirectory: targetRoot },
      files: [
        {
          relativePath: 'skills/doctor/SKILL.md',
          content: '# Doctor\n',
          sourceId: 'doctor',
          kind: 'skills'
        }
      ]
    }
  ]

  const initialPlan = await planInstallation({
    repositoryRoot,
    targets,
    previousState: EMPTY_INSTALLATION_STATE,
    conflictStrategy: 'error',
    prune: false
  })
  const result = await install(initialPlan)
  const state = await loadInstallationState(repositoryRoot)
  const installedPath = path.join(targetRoot, 'skills/doctor/SKILL.md')

  assert.equal(result.created, 1)
  assert.equal(await readFile(installedPath, 'utf8'), '# Doctor\n')
  assert.equal(state.files.length, 1)

  await writeFile(installedPath, '# User change\n')
  const conflictPlan = await planInstallation({
    repositoryRoot,
    targets,
    previousState: state,
    conflictStrategy: 'error',
    prune: false
  })

  assert.equal(conflictPlan.conflicts[0]?.code, 'modified-owned-file')
  await assert.rejects(() => install(conflictPlan), /contains conflicts/)
})

test('dry-run reports changes without writing files or state', async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ordo-dry-run-'))
  temporaryDirectories.push(repositoryRoot)
  const plan = await planInstallation({
    repositoryRoot,
    targets: [
      {
        target: { adapter: 'claude', rootDirectory: path.join(repositoryRoot, '.claude') },
        files: [
          {
            relativePath: 'agents/reviewer.md',
            content: '# Reviewer\n',
            sourceId: 'reviewer',
            kind: 'agents'
          }
        ]
      }
    ],
    previousState: EMPTY_INSTALLATION_STATE,
    conflictStrategy: 'error',
    prune: false
  })

  const result = await install(plan, { dryRun: true })

  assert.equal(result.created, 1)
  assert.equal(result.dryRun, true)
  await assert.rejects(() => readFile(path.join(repositoryRoot, '.ordo/state.json')), /ENOENT/)
})

test('planner rejects targets outside the repository', async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'ordo-path-'))
  temporaryDirectories.push(repositoryRoot)

  await assert.rejects(
    () =>
      planInstallation({
        repositoryRoot,
        targets: [
          {
            target: { adapter: 'codex', rootDirectory: path.dirname(repositoryRoot) },
            files: [
              {
                relativePath: 'AGENTS.md',
                content: '# Instructions\n',
                sourceId: 'instructions',
                kind: 'rules'
              }
            ]
          }
        ],
        previousState: EMPTY_INSTALLATION_STATE,
        conflictStrategy: 'error',
        prune: false
      }),
    /outside repository root/
  )
})
