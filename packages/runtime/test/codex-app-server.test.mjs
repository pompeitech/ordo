import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { codexAgentAdapter, codexCapabilities } from '../dist/index.js'

const directories = []
after(async () =>
  Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })))
)

async function fixture(source) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-codex-app-server-'))
  directories.push(directory)
  const command = path.join(directory, 'fake-codex')
  await writeFile(command, `#!/usr/bin/env node\n${source}\n`)
  await chmod(command, 0o755)
  return { directory, command }
}

test('Codex adapter negotiates app-server, starts a thread/turn and normalizes streamed output', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const m = JSON.parse(line)
  if (!m.id) return
  if (m.method === 'initialize') emit({jsonrpc:'2.0',id:m.id,result:{}})
  if (m.method === 'thread/start') emit({jsonrpc:'2.0',id:m.id,result:{thread:{id:'thread-1'}}})
  if (m.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:m.id,result:{turn:{id:'turn-1'}}})
    setImmediate(() => {
      emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'thread-1',turnId:'turn-1',delta:'Codex says hi'}})
      emit({jsonrpc:'2.0',method:'item/completed',params:{item:{root:{type:'agentMessage',text:'Codex says hi'}}}})
      emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-1',status:'completed'}}})
    })
  }
})
`)
  const installation = await codexAgentAdapter.detect({
    command: fake.command,
    cwd: fake.directory
  })
  const events = []
  const result = await codexAgentAdapter.run({
    command: fake.command,
    cwd: fake.directory,
    prompt: 'Hello',
    onEvent: event => events.push(event)
  })
  assert.equal(installation.id, 'codex')
  assert.equal(installation.version, 'Codex test-version')
  assert.deepEqual(installation.capabilities, codexCapabilities)
  assert.deepEqual(result, { text: 'Codex says hi', nativeSessionId: 'thread-1', exitCode: 0 })
  assert.deepEqual(events, [
    { type: 'native-session', nativeSessionId: 'thread-1' },
    { type: 'text-delta', text: 'Codex says hi' },
    { type: 'result', text: 'Codex says hi', nativeSessionId: 'thread-1' }
  ])
})

test('Codex adapter rejects an already-cancelled run without spawning', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    codexAgentAdapter.run({ cwd: tmpdir(), prompt: 'Do not run', signal: controller.signal }),
    /cancelled/
  )
})

test('Codex adapter rejects when app-server exits during the JSON-RPC handshake', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
process.stderr.write('app-server could not initialize local state')
process.exit(1)
`)
  await assert.rejects(
    codexAgentAdapter.run({ command: fake.command, cwd: fake.directory, prompt: 'Hello' }),
    /app-server could not initialize local state/
  )
})

test('Codex approval server requests are surfaced and answered per operation', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line)
  if (message.id === 1 && message.method === 'initialize') emit({jsonrpc:'2.0',id:1,result:{}})
  if (message.id === 2 && message.method === 'thread/start') emit({jsonrpc:'2.0',id:2,result:{thread:{id:'thread-approval'}}})
  if (message.id === 3 && message.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:3,result:{turn:{id:'turn-approval'}}})
    setImmediate(() => emit({method:'item/commandExecution/requestApproval',id:71,params:{threadId:'thread-approval',turnId:'turn-approval',itemId:'item-1',startedAtMs:1,command:'pnpm test',cwd:'/workspace',reason:'Test run'}}))
  }
  if (message.method === 'item/commandExecution/requestApproval' && message.id === 71) {
    emit({method:'item/fileChange/requestApproval',id:72,params:{threadId:'thread-approval',turnId:'turn-approval',itemId:'item-2',startedAtMs:2,reason:'Apply a patch'}})
  }
  if (message.method === 'item/fileChange/requestApproval' && message.id === 72) {
    emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'thread-approval',turnId:'turn-approval',delta:'Finished'}})
    emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-approval',status:'completed'}}})
  }
})
`)
  const events = []
  const requests = []
  const result = await codexAgentAdapter.run({
    command: fake.command,
    cwd: fake.directory,
    prompt: 'Run approval fixture',
    onEvent: event => events.push(event),
    onApprovalRequest(request) {
      requests.push(request)
      return request.kind === 'command-execution' ? 'accept' : 'decline'
    }
  })
  assert.equal(result.text, 'Finished')
  assert.deepEqual(
    requests.map(({ kind, command, cwd, reason }) => ({ kind, command, cwd, reason })),
    [
      { kind: 'command-execution', command: 'pnpm test', cwd: '/workspace', reason: 'Test run' },
      { kind: 'file-change', command: undefined, cwd: undefined, reason: 'Apply a patch' }
    ]
  )
  assert.ok(
    events.some(
      event =>
        event.type === 'approval-decision' && event.id === '71' && event.decision === 'accept'
    )
  )
  assert.ok(
    events.some(
      event =>
        event.type === 'approval-decision' && event.id === '72' && event.decision === 'decline'
    )
  )
})

test('Codex approvals fail closed when the caller has no approval handler', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line)
  if (message.id === 1 && message.method === 'initialize') emit({jsonrpc:'2.0',id:1,result:{}})
  if (message.id === 2 && message.method === 'thread/start') emit({jsonrpc:'2.0',id:2,result:{thread:{id:'thread-deny'}}})
  if (message.id === 3 && message.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:3,result:{turn:{id:'turn-deny'}}})
    setImmediate(() => emit({method:'item/fileChange/requestApproval',id:81,params:{threadId:'thread-deny',turnId:'turn-deny',itemId:'item-1',startedAtMs:1}}))
  }
  if (message.method === 'item/fileChange/requestApproval' && message.id === 81) {
    emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'thread-deny',turnId:'turn-deny',delta:'Denied safely'}})
    emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-deny',status:'completed'}}})
  }
})
`)
  let decisionEvent
  const result = await codexAgentAdapter.run({
    command: fake.command,
    cwd: fake.directory,
    prompt: 'No handler means deny',
    onEvent(event) {
      if (event.type === 'approval-decision') {
        decisionEvent = event
      }
    }
  })
  assert.equal(result.text, 'Denied safely')
  assert.deepEqual(decisionEvent, { type: 'approval-decision', id: '81', decision: 'decline' })
})

test('Codex permission escalations apply only to the current turn and deny to an empty profile', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line)
  if (message.id === 1 && message.method === 'initialize') emit({jsonrpc:'2.0',id:1,result:{}})
  if (message.id === 2 && message.method === 'thread/start') emit({jsonrpc:'2.0',id:2,result:{thread:{id:'thread-permissions'}}})
  if (message.id === 3 && message.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:3,result:{turn:{id:'turn-permissions'}}})
    setImmediate(() => emit({method:'item/permissions/requestApproval',id:91,params:{threadId:'thread-permissions',turnId:'turn-permissions',itemId:'permission-allow',environmentId:null,startedAtMs:1,cwd:'/workspace',reason:'Network needed',permissions:{network:{enabled:true},fileSystem:null}}}))
  }
  if (message.method === 'item/permissions/requestApproval' && message.id === 91) {
    if (message.response.scope !== 'turn' || message.response.permissions.network?.enabled !== true) process.exit(20)
    emit({method:'item/permissions/requestApproval',id:92,params:{threadId:'thread-permissions',turnId:'turn-permissions',itemId:'permission-deny',environmentId:null,startedAtMs:2,cwd:'/workspace',reason:'Write access needed',permissions:{network:null,fileSystem:{read:null,write:['/sensitive']}}}})
  }
  if (message.method === 'item/permissions/requestApproval' && message.id === 92) {
    if (message.response.scope !== 'turn' || Object.keys(message.response.permissions).length !== 0) process.exit(21)
    emit({jsonrpc:'2.0',method:'item/agentMessage/delta',params:{threadId:'thread-permissions',turnId:'turn-permissions',delta:'Permission decisions scoped to turn'}})
    emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-permissions',status:'completed'}}})
  }
})
`)
  const seen = []
  const result = await codexAgentAdapter.run({
    command: fake.command,
    cwd: fake.directory,
    prompt: 'Exercise permission request handling',
    onApprovalRequest(request) {
      seen.push(request)
      return request.details.itemId === 'permission-allow' ? 'accept' : 'decline'
    }
  })
  assert.equal(result.text, 'Permission decisions scoped to turn')
  assert.deepEqual(
    seen.map(request => request.kind),
    ['permission-escalation', 'permission-escalation']
  )
  assert.deepEqual(
    seen.map(request => request.reason),
    ['Network needed', 'Write access needed']
  )
})

test('unsupported Codex server requests stop the run instead of inventing a response', async () => {
  const fake = await fixture(`
if (process.argv[2] === '--version') { process.stdout.write('Codex test-version\\n'); process.exit(0) }
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line)
  if (message.id === 1 && message.method === 'initialize') emit({jsonrpc:'2.0',id:1,result:{}})
  if (message.id === 2 && message.method === 'thread/start') emit({jsonrpc:'2.0',id:2,result:{thread:{id:'thread-unsupported'}}})
  if (message.id === 3 && message.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:3,result:{turn:{id:'turn-unsupported'}}})
    setImmediate(() => emit({method:'mcpServer/elicitation/request',id:99,params:{threadId:'thread-unsupported',serverName:'fixture',message:'Unsupported input'}}))
  }
})
`)
  await assert.rejects(
    codexAgentAdapter.run({ command: fake.command, cwd: fake.directory, prompt: 'Fail closed' }),
    /Unsupported Codex app-server server request: mcpServer\/elicitation\/request/
  )
})
