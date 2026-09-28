import assert from 'node:assert/strict'
import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  chatHandoff,
  claudeCodeArguments,
  codexAgentAdapter,
  deleteChat,
  listChats,
  readChat,
  sendChatMessage
} from '../dist/index.js'

const directories = []
after(() =>
  Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })))
)

async function temporary(prefix) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

const connected = id => async () => ({
  id,
  status: 'connected',
  command: id,
  message: 'connected',
  installation: { id, command: id, version: 'test', capabilities: {} },
  usesApiKey: false
})

/** A fake harness that answers with a fixed text and records every run. */
function fakeAdapter(id, answer, calls, options = {}) {
  let session = 0
  return {
    id,
    async detect() {},
    async run(run) {
      calls.push({ prompt: run.prompt, resume: run.resume, access: run.access })
      if (options.failResume && run.resume) {
        throw new Error('No conversation found with that ID')
      }
      if (options.fail) {
        await run.onEvent?.({ type: 'text-delta', text: 'partial' })
        throw new Error('harness crashed')
      }
      const nativeSessionId = run.resume ?? `${id}-session-${++session}`
      await run.onEvent?.({ type: 'native-session', nativeSessionId })
      await run.onEvent?.({ type: 'text-delta', text: answer })
      await run.onEvent?.({ type: 'usage', inputTokens: 10, outputTokens: 5 })
      return { text: answer, nativeSessionId, exitCode: 0 }
    }
  }
}

async function setup() {
  const projectRoot = await temporary('ordo-chat-project-')
  const directory = await temporary('ordo-chat-state-')
  return { projectRoot, directory }
}

test('a chat is stored outside the project and continues the same agent session', async () => {
  const { projectRoot, directory } = await setup()
  const calls = []
  const adapters = { 'claude-code': fakeAdapter('claude-code', 'It validates cards.', calls) }
  const streamed = []
  const first = await sendChatMessage({
    projectRoot,
    directory,
    agent: 'claude-code',
    text: 'What does checkout.ts do?',
    access: 'read-only',
    adapters,
    checkConnection: connected('claude-code'),
    onText: text => streamed.push(text)
  })
  assert.equal(first.chat.title, 'What does checkout.ts do?')
  assert.equal(first.reply.text, 'It validates cards.')
  assert.equal(first.reply.inputTokens, 10)
  assert.deepEqual(streamed, ['It validates cards.'])
  assert.deepEqual(first.chat.nativeSessions, { 'claude-code': 'claude-code-session-1' })
  assert.equal(calls[0].access, 'read-only')
  assert.equal(calls[0].resume, undefined)
  assert.match(calls[0].prompt, /read-only mode/)
  assert.match(calls[0].prompt, /What does checkout\.ts do\?$/)

  const second = await sendChatMessage({
    projectRoot,
    directory,
    chatId: first.chat.id,
    agent: 'claude-code',
    text: 'And the errors?',
    access: 'read-only',
    adapters,
    checkConnection: connected('claude-code')
  })
  assert.equal(calls[1].resume, 'claude-code-session-1')
  assert.equal(calls[1].prompt, 'And the errors?')
  assert.equal(second.chat.messages.length, 4)

  const [file] = await listChats(projectRoot, { directory })
  assert.equal(file.id, first.chat.id)
  assert.equal(file.messageCount, 4)
  assert.equal(file.lastAgent, 'claude-code')
  const stored = await readChat(projectRoot, first.chat.id, { directory })
  assert.deepEqual(stored, second.chat)
  const [projectKey] = await readdir(directory)
  const info = await stat(path.join(directory, projectKey, `${first.chat.id}.json`))
  assert.equal(info.mode & 0o777, 0o600, 'only the user can read a chat')
  assert.deepEqual(await readdir(projectRoot), [], 'nothing is written into the project')
})

test('switching agents hands over only the messages the new agent missed', async () => {
  const { projectRoot, directory } = await setup()
  const claudeCalls = []
  const codexCalls = []
  const adapters = {
    'claude-code': fakeAdapter('claude-code', 'Claude answer', claudeCalls),
    codex: fakeAdapter('codex', 'Codex answer', codexCalls)
  }
  const send = (agent, text, chatId) =>
    sendChatMessage({
      projectRoot,
      directory,
      chatId,
      agent,
      text,
      adapters,
      checkConnection: connected(agent)
    })
  const one = await send('claude-code', 'First question')
  assert.deepEqual(chatHandoff(one.chat, 'codex').messages, 2)
  assert.deepEqual(chatHandoff(one.chat, 'claude-code').messages, 0)

  const two = await send('codex', 'Second question', one.chat.id)
  assert.equal(codexCalls[0].resume, undefined)
  assert.match(codexCalls[0].prompt, /User: First question\n\nClaude Code: Claude answer/)
  assert.match(codexCalls[0].prompt, /Now reply to the user:\n\nSecond question$/)

  await send('claude-code', 'Third question', two.chat.id)
  assert.equal(claudeCalls[1].resume, 'claude-code-session-1')
  assert.doesNotMatch(claudeCalls[1].prompt, /First question/)
  assert.match(claudeCalls[1].prompt, /User: Second question\n\nCodex: Codex answer/)
})

test('a failed reply is stored with its error and left out of later handovers', async () => {
  const { projectRoot, directory } = await setup()
  const calls = []
  const failed = await sendChatMessage({
    projectRoot,
    directory,
    agent: 'codex',
    text: 'Explain the plan',
    adapters: { codex: fakeAdapter('codex', '', calls, { fail: true }) },
    checkConnection: connected('codex')
  })
  assert.equal(failed.reply.error, 'harness crashed')
  assert.equal(failed.reply.text, 'partial')
  assert.equal(chatHandoff(failed.chat, 'claude-code').messages, 1)
})

test('a forgotten native session is started again with the full transcript', async () => {
  const { projectRoot, directory } = await setup()
  const calls = []
  const adapters = { 'claude-code': fakeAdapter('claude-code', 'Answer', calls) }
  const first = await sendChatMessage({
    projectRoot,
    directory,
    agent: 'claude-code',
    text: 'Hello',
    adapters,
    checkConnection: connected('claude-code')
  })
  const forgetful = {
    'claude-code': fakeAdapter('claude-code', 'Again', calls, { failResume: true })
  }
  const second = await sendChatMessage({
    projectRoot,
    directory,
    chatId: first.chat.id,
    agent: 'claude-code',
    text: 'Still there?',
    adapters: forgetful,
    checkConnection: connected('claude-code')
  })
  assert.equal(second.reply.error, undefined)
  assert.equal(calls[2].resume, undefined)
  assert.match(calls[2].prompt, /User: Hello\n\nClaude Code: Answer/)
  assert.equal(second.chat.nativeSessions['claude-code'], 'claude-code-session-1')
})

test('an agent that is not connected stores nothing', async () => {
  const { projectRoot, directory } = await setup()
  await assert.rejects(
    sendChatMessage({
      projectRoot,
      directory,
      agent: 'codex',
      text: 'Hi',
      checkConnection: async () => ({
        id: 'codex',
        status: 'not-authenticated',
        command: 'codex',
        message: 'Codex is installed but not logged in.',
        usesApiKey: false
      })
    }),
    /not logged in/
  )
  assert.deepEqual(await listChats(projectRoot, { directory }), [])
})

test('chats are deleted by ID and invalid IDs are refused', async () => {
  const { projectRoot, directory } = await setup()
  const { chat } = await sendChatMessage({
    projectRoot,
    directory,
    agent: 'codex',
    text: 'Hi',
    adapters: { codex: fakeAdapter('codex', 'Hello', []) },
    checkConnection: connected('codex')
  })
  await assert.rejects(readChat(projectRoot, '../profile', { directory }), /Invalid chat ID/)
  await deleteChat(projectRoot, chat.id, { directory })
  assert.deepEqual(await listChats(projectRoot, { directory }), [])
})

test('read-only Claude Code runs get only read tools and resume their session', () => {
  assert.deepEqual(
    claudeCodeArguments({ prompt: '-not a flag', resume: 'abc', access: 'read-only' }),
    [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--resume',
      'abc',
      '--permission-mode',
      'dontAsk',
      '--allowedTools=Read,Grep,Glob',
      '--',
      '-not a flag'
    ]
  )
  assert.deepEqual(claudeCodeArguments({ prompt: 'Run the step' }).slice(-2), [
    '--',
    'Run the step'
  ])
})

test('read-only Codex runs resume their thread in the read-only sandbox', async () => {
  const directory = await temporary('ordo-codex-chat-')
  const log = path.join(directory, 'requests.jsonl')
  const command = path.join(directory, 'fake-codex')
  await writeFile(
    command,
    `#!/usr/bin/env node
const fs = require('node:fs')
const readline = require('node:readline')
const emit = value => process.stdout.write(JSON.stringify(value) + '\\n')
readline.createInterface({input: process.stdin}).on('line', line => {
  const m = JSON.parse(line)
  if (!m.id) return
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({method: m.method, params: m.params}) + '\\n')
  if (m.method === 'initialize') emit({jsonrpc:'2.0',id:m.id,result:{}})
  if (m.method === 'thread/resume') emit({jsonrpc:'2.0',id:m.id,result:{thread:{id:m.params.threadId}}})
  if (m.method === 'turn/start') {
    emit({jsonrpc:'2.0',id:m.id,result:{turn:{id:'turn-1'}}})
    setImmediate(() => emit({jsonrpc:'2.0',method:'turn/completed',params:{turn:{id:'turn-1',status:'completed'}}}))
  }
})
`
  )
  await chmod(command, 0o755)
  const result = await codexAgentAdapter.run({
    command,
    cwd: directory,
    prompt: 'Which word?',
    resume: 'thread-7',
    access: 'read-only'
  })
  assert.equal(result.nativeSessionId, 'thread-7')
  const requests = (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  const resume = requests.find(request => request.method === 'thread/resume')
  assert.deepEqual(resume.params, {
    threadId: 'thread-7',
    cwd: directory,
    sandbox: 'read-only',
    approvalPolicy: 'never'
  })
  assert.equal(
    requests.some(request => request.method === 'thread/start'),
    false
  )
})
