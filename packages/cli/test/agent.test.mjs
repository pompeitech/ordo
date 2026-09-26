import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  createPlan,
  createSpec,
  initializeProjectProfile,
  listSessions,
  readPlan,
  readSession,
  updateSpecStatus
} from '@pompeitech/ordo-core'
import { runCli } from '../dist/program.js'

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

function captureOutput(onWrite) {
  let output = ''
  return {
    read: () => output,
    write(chunk) {
      output += chunk
      onWrite?.(chunk)
    }
  }
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ordo-agent-claude-'))
  temporaryDirectories.push(root)
  const repository = path.join(root, 'repo with spaces')
  await mkdir(path.join(repository, '.git'), { recursive: true })
  await writeFile(path.join(repository, 'package.json'), '{"name":"agent-fixture"}\n')
  const contentRoot = path.join(root, 'shared-content')
  await mkdir(path.join(contentRoot, 'agents'), { recursive: true })
  await mkdir(path.join(contentRoot, 'skills', 'domain'), { recursive: true })
  await mkdir(path.join(contentRoot, 'rules'), { recursive: true })
  await mkdir(path.join(contentRoot, 'workflows'), { recursive: true })
  await writeFile(
    path.join(contentRoot, 'agents', 'planner.md'),
    '---\nname: planner\ndescription: Project planner\n---\n\nPlanner instructions from shared content.\n'
  )
  await writeFile(
    path.join(contentRoot, 'skills', 'domain', 'SKILL.md'),
    '---\nname: domain\ndescription: Business domain skill\n---\n\nDomain skill instructions from shared content.\n'
  )
  await writeFile(
    path.join(contentRoot, 'rules', 'common-business.md'),
    '---\nname: common-business\ndescription: Business rules\n---\n\nProtect business invariants.\n'
  )
  await writeFile(
    path.join(contentRoot, 'workflows', 'implement.md'),
    '# Implement Workflow\n\nUse the approved plan and verify changes.\n'
  )
  await initializeProjectProfile(repository, contentRoot, {
    agentIds: ['planner'],
    defaultAgentId: 'planner',
    skillIds: ['domain']
  })
  await mkdir(path.join(repository, 'docs'), { recursive: true })
  await writeFile(
    path.join(repository, 'docs', 'business.md'),
    'Business context source: orders must be auditable.\n'
  )
  const specDraft = await createSpec(repository, {
    title: 'Auditable orders',
    objective: 'Keep every order change auditable.',
    acceptanceCriteria: '- Every state change has an actor and timestamp.'
  })
  const spec = await updateSpecStatus(repository, specDraft.id, 'ready')
  const plan = await createPlan(repository, {
    title: 'Order audit plan',
    specId: spec.id,
    steps: [
      {
        id: 'audit-record',
        description: 'Implement an audit record for each order state change.',
        inputs: ['Existing order state transition service'],
        expectedOutput: 'A persisted audit record with actor and timestamp.',
        areas: ['src/orders'],
        verification: ['pnpm test --filter orders']
      }
    ]
  })
  await mkdir(path.join(repository, '.ordo', 'context'), { recursive: true })
  await writeFile(
    path.join(repository, '.ordo', 'context', 'index.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        {
          id: 'business-context',
          path: 'docs/business.md',
          visibility: 'visible',
          addedAt: new Date().toISOString()
        }
      ]
    }) + '\n'
  )
  const command = path.join(root, 'fake claude')
  await writeFile(
    command,
    `#!/usr/bin/env node
if (process.argv[2] === 'auth') {
  process.stdout.write(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}))
  process.exit(0)
}
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code 9.9.9\\n')
  process.exit(0)
}
const prompt = process.argv.at(-1)
const checks = {
  spec: prompt.includes('Keep every order change auditable.'),
  acceptance: prompt.includes('Every state change has an actor and timestamp.'),
  step: prompt.includes('Implement an audit record for each order state change.'),
  context: prompt.includes('Business context source: orders must be auditable.'),
  profileAgent: prompt.includes('Planner instructions from shared content.'),
  profileSkill: prompt.includes('Domain skill instructions from shared content.'),
  profileRule: prompt.includes('Protect business invariants.'),
  implementWorkflow: prompt.includes('# Implement Workflow'),
  unrelatedWorkflowOmitted: !prompt.includes('# Release Workflow'),
  extraPrompt: prompt.includes('Do not invoke a shell')
}
const answer = JSON.stringify(checks)
process.stdout.write(JSON.stringify({type:'stream_event',session_id:'native-session-1',event:{delta:{type:'text_delta',text:answer}}})+'\\n')
process.stdout.write(JSON.stringify({type:'result',session_id:'native-session-1',result:answer})+'\\n')
`
  )
  await chmod(command, 0o755)
  const codexCommand = path.join(root, 'fake codex')
  await writeFile(
    codexCommand,
    `#!/usr/bin/env node
if (process.argv[2] === 'login') { process.stderr.write('Logged in using ChatGPT\\n'); process.exit(0) }
if (process.argv[2] === '--version') { process.stdout.write('Codex 9.9.9\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line)
  if (!message.id) return
  if (message.method === 'initialize') emit({jsonrpc:'2.0',id:message.id,result:{}})
  if (message.method === 'thread/start') emit({jsonrpc:'2.0',id:message.id,result:{thread:{id:'codex-thread-1'}}})
  if (message.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:message.id,result:{turn:{id:'codex-turn-1'}}})
    setImmediate(() => {
      if (message.params.input[0].text.includes('Trigger approval fixture')) {
        emit({method:'item/fileChange/requestApproval',id:92,params:{threadId:'codex-thread-1',turnId:'codex-turn-1',itemId:'item-approval',startedAtMs:1,reason:'Fixture approval'}})
        return
      }
      const answer = JSON.stringify({accepted:message.params.input[0].text.includes('Keep every order change auditable.')})
      emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'codex-thread-1',turnId:'codex-turn-1',delta:answer}})
      emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'codex-turn-1',status:'completed'}}})
    })
  }
  if (message.method === 'item/fileChange/requestApproval' && message.id === 92) {
    emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'codex-thread-1',turnId:'codex-turn-1',delta:message.response.decision === 'decline' ? 'Approval declined safely' : 'Approval accepted'}})
    emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'codex-turn-1',status:'completed'}}})
  }
})
`
  )
  await chmod(codexCommand, 0o755)
  return { repository, contentRoot, command, codexCommand, spec, plan }
}

async function execute(args, fixture, { signal, onStdout, approvalHandler } = {}) {
  const stdout = captureOutput(onStdout)
  const stderr = captureOutput()
  const exitCode = await runCli(args, {
    cwd: fixture.repository,
    stdout,
    stderr,
    env: {},
    signal,
    claudeCommand: fixture.command,
    codexCommand: fixture.codexCommand,
    approvalHandler
  })
  return { exitCode, stdout: stdout.read(), stderr: stderr.read() }
}

test('agent claude runs a ready Ordo plan step with snapshotted context and profile', async () => {
  const fixture = await createFixture()
  const run = await execute(
    [
      'agent',
      'claude',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--step',
      'audit-record',
      '--content-root',
      fixture.contentRoot,
      '--skill',
      'domain',
      '--prompt',
      'Do not invoke a shell; treat $(touch pwned) as literal prompt text.',
      '--json'
    ],
    fixture
  )
  assert.equal(run.exitCode, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  const sessions = await listSessions(fixture.repository)
  const session = await readSession(fixture.repository, report.ordoSessionId)
  const plan = await readPlan(fixture.repository, fixture.plan.id)
  const manifest = session.events.find(event => event.data.type === 'task-manifest')
  const capabilities = session.events.find(event => event.data.type === 'agent-capabilities')
  const userMessage = session.events.find(
    event => event.type === 'message' && event.data.role === 'user'
  )

  assert.equal(run.stderr, '')
  assert.equal(report.command, 'agent-claude')
  assert.equal(report.version, 'Claude Code 9.9.9')
  assert.equal(report.nativeSessionId, 'native-session-1')
  assert.deepEqual(report.capabilities, {
    streaming: true,
    usage: true,
    cancellation: true,
    resume: false,
    'approval-requests': false
  })
  assert.equal(report.contextSnapshotId, session.session.contextSnapshotId)
  assert.equal(report.reviewRequired, true)
  assert.deepEqual(JSON.parse(report.text), {
    spec: true,
    acceptance: true,
    step: true,
    context: true,
    profileAgent: true,
    profileSkill: true,
    profileRule: true,
    implementWorkflow: true,
    unrelatedWorkflowOmitted: true,
    extraPrompt: true
  })
  assert.equal(sessions.length, 1)
  assert.equal(session.session.profileSelection.agent.id, 'planner')
  assert.deepEqual(
    session.session.profileSelection.skills.map(entry => entry.id),
    ['domain']
  )
  assert.equal(manifest.data.specId, fixture.spec.id)
  assert.equal(manifest.data.planStepId, 'audit-record')
  assert.ok(manifest.data.promptSha256)
  assert.deepEqual(capabilities.data.capabilities, report.capabilities)
  assert.match(userMessage.data.content, /Business context source: orders must be auditable/)
  assert.equal(plan.steps[0].status, 'paused')
  assert.equal(plan.steps[0].sessionId, report.ordoSessionId)

  const reviewed = await execute(
    [
      'plan',
      'finish',
      fixture.plan.id,
      '--step-id',
      'audit-record',
      '--status',
      'completed',
      '--json'
    ],
    fixture
  )
  assert.equal(JSON.parse(reviewed.stdout).plan.status, 'completed')
})

test('agent codex declines approvals by default in non-interactive mode and audits the decision', async () => {
  const fixture = await createFixture()
  const run = await execute(
    [
      'agent',
      'codex',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--content-root',
      fixture.contentRoot,
      '--prompt',
      'Trigger approval fixture',
      '--json'
    ],
    fixture
  )
  assert.equal(run.exitCode, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  const session = await readSession(fixture.repository, report.ordoSessionId)
  const approvals = session.events.filter(event => event.type === 'approval')
  assert.equal(report.text, 'Approval declined safely')
  assert.deepEqual(
    approvals.map(event => event.data.status),
    ['requested', 'denied']
  )
  assert.equal(approvals[0].data.kind, 'file-change')
  assert.equal(approvals[1].data.decision, 'decline')
})

test('agent codex accepts an explicit per-request approval handler and audits the decision', async () => {
  const fixture = await createFixture()
  const requests = []
  const run = await execute(
    [
      'agent',
      'codex',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--content-root',
      fixture.contentRoot,
      '--prompt',
      'Trigger approval fixture',
      '--json'
    ],
    fixture,
    {
      approvalHandler(request) {
        requests.push(request)
        return 'accept'
      }
    }
  )
  assert.equal(run.exitCode, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  const session = await readSession(fixture.repository, report.ordoSessionId)
  const approvals = session.events.filter(event => event.type === 'approval')
  assert.equal(report.text, 'Approval accepted')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].kind, 'file-change')
  assert.deepEqual(
    approvals.map(event => event.data.status),
    ['requested', 'approved']
  )
  assert.equal(approvals[1].data.decision, 'accept')
})

test('agent codex runs the same Ordo plan through app-server and records its native thread', async () => {
  const fixture = await createFixture()
  const run = await execute(
    [
      'agent',
      'codex',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--content-root',
      fixture.contentRoot,
      '--json'
    ],
    fixture
  )
  assert.equal(run.exitCode, 0, run.stderr)
  const report = JSON.parse(run.stdout)
  const session = await readSession(fixture.repository, report.ordoSessionId)
  assert.equal(report.command, 'agent-codex')
  assert.equal(report.agent, 'codex')
  assert.equal(report.nativeSessionId, 'codex-thread-1')
  assert.equal(report.version, 'Codex 9.9.9')
  assert.deepEqual(report.capabilities, {
    streaming: true,
    usage: false,
    cancellation: true,
    resume: false,
    'approval-requests': true
  })
  assert.ok(
    session.events.some(
      event => event.data.type === 'native-session' && event.data.id === 'codex-thread-1'
    )
  )
  assert.ok(
    session.events.some(event => event.data.type === 'harness' && event.data.id === 'codex')
  )
})

test('agent claude requires a spec and plan and explains human review', async () => {
  const fixture = await createFixture()
  const stdout = captureOutput()
  const stderr = captureOutput()
  const invalid = await runCli(['agent', 'claude'], {
    cwd: fixture.repository,
    stdout,
    stderr,
    env: {}
  })
  assert.equal(invalid, 2)
  assert.match(stderr.read(), /requires --spec and --plan/)

  const helpOutput = captureOutput()
  const help = await runCli(['agent', 'claude', '--help'], {
    cwd: fixture.repository,
    stdout: helpOutput,
    stderr: captureOutput(),
    env: {}
  })
  assert.equal(help, 0)
  assert.match(helpOutput.read(), /paused for human review/)
  assert.match(helpOutput.read(), /Ctrl-C/)
})

test('agent claude interruption terminates the child and persists a paused session and step', async () => {
  const fixture = await createFixture()
  await writeFile(
    fixture.command,
    `#!/usr/bin/env node
if (process.argv[2] === 'auth') {
  process.stdout.write(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}))
  process.exit(0)
}
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code 9.9.9\\n')
  process.exit(0)
}
process.on('SIGTERM', () => process.exit(0))
process.stdout.write(JSON.stringify({type:'stream_event',session_id:'native-session-interrupted',event:{delta:{type:'text_delta',text:'started'}}})+'\\n')
setInterval(() => {}, 1000)
`
  )
  const controller = new AbortController()
  const run = await execute(
    [
      'agent',
      'claude',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--step',
      'audit-record',
      '--content-root',
      fixture.contentRoot
    ],
    fixture,
    {
      signal: controller.signal,
      onStdout(chunk) {
        if (chunk === 'started') {
          controller.abort()
        }
      }
    }
  )
  const sessions = await listSessions(fixture.repository)
  const session = await readSession(fixture.repository, sessions[0].id)
  const plan = await readPlan(fixture.repository, fixture.plan.id)

  assert.equal(run.exitCode, 130)
  assert.match(run.stderr, /session and plan step are paused/)
  assert.equal(sessions.length, 1)
  assert.equal(session.session.status, 'paused')
  assert.equal(plan.steps[0].status, 'paused')
  assert.equal(
    session.events.find(event => event.data.type === 'native-session')?.data.id,
    'native-session-interrupted'
  )
  assert.equal(session.events.find(event => event.type === 'status')?.data.status, 'paused')
})

test('agent claude refuses to run when Claude Code is installed but not logged in', async () => {
  const fixture = await createFixture()
  await writeFile(
    fixture.command,
    `#!/usr/bin/env node
if (process.argv[2] === 'auth') {
  process.stdout.write(JSON.stringify({loggedIn:false}))
  process.exit(1)
}
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code 9.9.9\\n')
  process.exit(0)
}
process.stdout.write('the agent must not be started')
process.exit(3)
`
  )
  const run = await execute(
    [
      'agent',
      'claude',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--step',
      'audit-record',
      '--content-root',
      fixture.contentRoot
    ],
    fixture
  )
  const plan = await readPlan(fixture.repository, fixture.plan.id)

  assert.notEqual(run.exitCode, 0)
  assert.match(run.stderr, /not logged in/)
  assert.match(run.stderr, /\/login/)
  assert.deepEqual(await listSessions(fixture.repository), [])
  assert.equal(plan.steps.find(step => step.id === 'audit-record').status, 'pending')
})

test('agent claude keeps plan usage on this machine and out of the shared session log', async () => {
  const fixture = await createFixture()
  const stateDirectory = await mkdtemp(path.join(tmpdir(), 'ordo-agent-state-'))
  temporaryDirectories.push(stateDirectory)
  await writeFile(
    fixture.command,
    `#!/usr/bin/env node
if (process.argv[2] === 'auth') {
  process.stdout.write(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}))
  process.exit(0)
}
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code 9.9.9\\n')
  process.exit(0)
}
process.stdout.write(JSON.stringify({type:'rate_limit_event',session_id:'native-usage',rate_limit_info:{status:'allowed',unifiedWindows:{five_hour:{utilization:0.25,resetsAt:1790379000},seven_day:{utilization:0.5,resetsAt:1790442000}}}})+'\\n')
process.stdout.write(JSON.stringify({type:'result',session_id:'native-usage',result:'done'})+'\\n')
`
  )
  const stdout = captureOutput()
  const stderr = captureOutput()
  const exitCode = await runCli(
    [
      'agent',
      'claude',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--step',
      'audit-record',
      '--content-root',
      fixture.contentRoot,
      '--json'
    ],
    {
      cwd: fixture.repository,
      stdout,
      stderr,
      env: { ORDO_STATE_DIR: stateDirectory },
      claudeCommand: fixture.command
    }
  )
  assert.equal(exitCode, 0, stderr.read())
  const report = JSON.parse(stdout.read())
  const stored = JSON.parse(await readFile(path.join(stateDirectory, 'usage.json'), 'utf8'))
  const session = await readSession(fixture.repository, report.ordoSessionId)

  assert.deepEqual(
    stored.agents['claude-code'].windows.map(window => [window.kind, window.usedPercent]),
    [
      ['five-hour', 25],
      ['weekly', 50]
    ]
  )
  assert.doesNotMatch(JSON.stringify(session.events), /usage-limits|five-hour|rate_limit/)
})

test('agent claude snapshots the work tree so the reviewer can see and undo its changes', async () => {
  const fixture = await createFixture()
  const repo = fixture.repository
  await rm(path.join(repo, '.git'), { recursive: true, force: true })
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.name', 'Ada Lovelace')
  git('config', 'user.email', 'ada@example.com')
  git('config', 'commit.gpgsign', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', 'Fixture')
  await writeFile(
    fixture.command,
    `#!/usr/bin/env node
if (process.argv[2] === 'auth') {
  process.stdout.write(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}))
  process.exit(0)
}
if (process.argv[2] === '--version') {
  process.stdout.write('Claude Code 9.9.9\\n')
  process.exit(0)
}
const fs = require('node:fs')
fs.mkdirSync('src', { recursive: true })
fs.writeFileSync('src/validator.js', 'module.exports = () => true\\n')
fs.writeFileSync('package.json', '{"name":"agent-fixture","type":"module"}\\n')
process.stdout.write(JSON.stringify({type:'result',session_id:'native-diff',result:'done'})+'\\n')
`
  )
  const planArgs = ['--step-id', 'audit-record', '--json']

  const run = await execute(
    [
      'agent',
      'claude',
      '--spec',
      fixture.spec.id,
      '--plan',
      fixture.plan.id,
      '--step',
      'audit-record',
      '--content-root',
      fixture.contentRoot,
      '--json'
    ],
    fixture
  )
  assert.equal(run.exitCode, 0, run.stderr)
  assert.deepEqual(
    JSON.parse(run.stdout).changedFiles.map(file => [file.path, file.change]),
    [
      ['package.json', 'modified'],
      ['src/validator.js', 'added']
    ]
  )

  const changes = await execute(['plan', 'changes', fixture.plan.id, ...planArgs], fixture)
  assert.equal(changes.exitCode, 0, changes.stderr)
  assert.deepEqual(
    JSON.parse(changes.stdout).changes.files.map(file => file.path),
    ['package.json', 'src/validator.js']
  )

  const review = await execute(
    [
      'plan',
      'review',
      fixture.plan.id,
      '--decision',
      'changes-requested',
      '--note',
      'Keep package.json as it was',
      '--reject',
      'package.json',
      ...planArgs
    ],
    fixture
  )
  assert.equal(review.exitCode, 0, review.stderr)
  assert.equal(
    await readFile(path.join(repo, 'package.json'), 'utf8'),
    '{"name":"agent-fixture"}\n'
  )
  assert.equal(
    await readFile(path.join(repo, 'src', 'validator.js'), 'utf8'),
    'module.exports = () => true\n'
  )
})
