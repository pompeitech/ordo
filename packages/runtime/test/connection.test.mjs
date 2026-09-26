import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { checkAgentConnection, loginCodexWithApiKey, runClaudeCode } from '../dist/index.js'

// Fixtures decide their login state from this variable; never inherit a real one.
delete process.env.ANTHROPIC_API_KEY

const temporaryDirectories = []

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function createCommand(source) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-connection-'))
  temporaryDirectories.push(directory)
  const command = path.join(directory, 'fake-harness')
  await writeFile(command, `#!/usr/bin/env node\n${source}\n`)
  await chmod(command, 0o755)
  return { directory, command }
}

const claudeStatus = status => `
if (process.argv[2] === '--version') { process.stdout.write('2.0.0 (Claude Code)\\n'); process.exit(0) }
if (process.argv[2] === 'auth' && process.argv[3] === 'status') {
  process.stdout.write(JSON.stringify(${JSON.stringify(status)}))
  process.exit(${status.loggedIn ? 0 : 1})
}
process.exit(2)
`

const codexStatus = (line, exitCode) => `
if (process.argv[2] === '--version') { process.stdout.write('codex-cli 0.1.0\\n'); process.exit(0) }
if (process.argv[2] === 'login' && process.argv[3] === 'status') {
  process.stderr.write(${JSON.stringify(line)} + '\\n')
  process.exit(${exitCode})
}
process.exit(2)
`

test('reports a missing executable as not found', async () => {
  const connection = await checkAgentConnection('claude-code', {
    command: path.join(tmpdir(), 'ordo-missing-claude'),
    cwd: tmpdir()
  })
  assert.equal(connection.status, 'not-found')
  assert.equal(connection.installation, undefined)
})

test('reports a logged-in Claude Code with its auth method and no account data', async () => {
  const fixture = await createCommand(
    claudeStatus({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'person@example.com',
      orgId: 'org-secret'
    })
  )
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory
  })
  assert.equal(connection.status, 'connected')
  assert.equal(connection.installation.version, '2.0.0 (Claude Code)')
  assert.equal(connection.authMethod, 'claude.ai')
  assert.equal(connection.apiProvider, 'firstParty')
  assert.doesNotMatch(JSON.stringify(connection), /person@example\.com|org-secret/)
})

test('refuses a Claude Code installation that is not logged in', async () => {
  const fixture = await createCommand(claudeStatus({ loggedIn: false }))
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory
  })
  assert.equal(connection.status, 'not-authenticated')
  assert.match(connection.message, /\/login/)
})

test('treats unreadable Claude status output as not authenticated', async () => {
  const fixture = await createCommand(`
if (process.argv[2] === '--version') { process.stdout.write('1.0.0\\n'); process.exit(0) }
process.stdout.write('not json')
`)
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory
  })
  assert.equal(connection.status, 'not-authenticated')
})

test('reports Codex ChatGPT and API key logins without the key itself', async () => {
  const chatgpt = await createCommand(codexStatus('Logged in using ChatGPT', 0))
  const apiKey = await createCommand(codexStatus('Logged in using an API key - sk-proj-***abcd', 0))
  const viaChatgpt = await checkAgentConnection('codex', {
    command: chatgpt.command,
    cwd: chatgpt.directory
  })
  const viaApiKey = await checkAgentConnection('codex', {
    command: apiKey.command,
    cwd: apiKey.directory
  })
  assert.equal(viaChatgpt.status, 'connected')
  assert.equal(viaChatgpt.authMethod, 'chatgpt')
  assert.equal(viaApiKey.status, 'connected')
  assert.equal(viaApiKey.authMethod, 'api-key')
  assert.doesNotMatch(JSON.stringify(viaApiKey), /sk-proj/)
})

test('refuses a Codex installation that is not logged in', async () => {
  const fixture = await createCommand(codexStatus('Not logged in', 1))
  const connection = await checkAgentConnection('codex', {
    command: fixture.command,
    cwd: fixture.directory
  })
  assert.equal(connection.status, 'not-authenticated')
  assert.match(connection.message, /codex login/)
})

test('treats a hanging status command as not authenticated', async () => {
  const fixture = await createCommand(`
if (process.argv[2] === '--version') { process.stdout.write('codex-cli 0.1.0\\n'); process.exit(0) }
setInterval(() => {}, 1000)
`)
  const connection = await checkAgentConnection('codex', {
    command: fixture.command,
    cwd: fixture.directory,
    timeoutMs: 200
  })
  assert.equal(connection.status, 'not-authenticated')
})

const TEST_KEY = 'sk-ant-test-0123456789'

// Logged in through the CLI only when `subscription` is true; otherwise only TEST_KEY works.
const claudeWithKeySupport = subscription => `
if (process.argv[2] === '--version') { process.stdout.write('2.0.0 (Claude Code)\\n'); process.exit(0) }
if (process.argv[2] === 'auth') {
  const key = process.env.ANTHROPIC_API_KEY
  const status = key === ${JSON.stringify(TEST_KEY)}
    ? { loggedIn: true, authMethod: 'api_key', apiKeySource: 'ANTHROPIC_API_KEY' }
    : ${subscription} ? { loggedIn: true, authMethod: 'claude.ai' } : { loggedIn: false, authMethod: 'none' }
  process.stdout.write(JSON.stringify(status))
  process.exit(0)
}
const answer = process.env.ANTHROPIC_API_KEY === ${JSON.stringify(TEST_KEY)} ? 'key-present' : 'key-absent'
process.stdout.write(JSON.stringify({ type: 'result', result: answer }) + '\\n')
`

test('Claude Code falls back to the user API key only when the CLI is not logged in', async () => {
  const fixture = await createCommand(claudeWithKeySupport(false))
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory,
    apiKey: TEST_KEY
  })
  assert.equal(connection.status, 'connected')
  assert.equal(connection.usesApiKey, true)
  assert.equal(connection.authMethod, 'api_key')
  assert.doesNotMatch(JSON.stringify(connection), /sk-ant-test/)
})

test('the Claude Code login always wins over a configured API key', async () => {
  const fixture = await createCommand(claudeWithKeySupport(true))
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory,
    apiKey: TEST_KEY
  })
  assert.equal(connection.status, 'connected')
  assert.equal(connection.usesApiKey, false)
  assert.equal(connection.authMethod, 'claude.ai')
})

test('an API key that Claude Code does not accept leaves it not authenticated', async () => {
  const fixture = await createCommand(claudeWithKeySupport(false))
  const connection = await checkAgentConnection('claude-code', {
    command: fixture.command,
    cwd: fixture.directory,
    apiKey: 'sk-ant-wrong'
  })
  assert.equal(connection.status, 'not-authenticated')
  assert.equal(connection.usesApiKey, false)
})

test('a Claude Code run receives the API key only when one is supplied', async () => {
  const fixture = await createCommand(claudeWithKeySupport(false))
  const withKey = await runClaudeCode({
    command: fixture.command,
    cwd: fixture.directory,
    prompt: 'hello',
    apiKey: TEST_KEY
  })
  const withoutKey = await runClaudeCode({
    command: fixture.command,
    cwd: fixture.directory,
    prompt: 'hello'
  })
  assert.equal(withKey.text, 'key-present')
  assert.equal(withoutKey.text, 'key-absent')
})

test('Codex API key login writes the key to stdin, never to argv or errors', async () => {
  const fixture = await createCommand(`
const fs = require('node:fs')
const path = require('node:path')
let input = ''
process.stdin.on('data', chunk => (input += chunk)).on('end', () => {
  fs.writeFileSync(path.join(__dirname, 'login.json'), JSON.stringify({ argv: process.argv.slice(2), input }))
  process.exit(input === 'sk-openai-good' ? 0 : 1)
})
`)
  await loginCodexWithApiKey({
    command: fixture.command,
    cwd: fixture.directory,
    apiKey: ' sk-openai-good '
  })
  const recorded = JSON.parse(await readFile(path.join(fixture.directory, 'login.json'), 'utf8'))
  assert.deepEqual(recorded, { argv: ['login', '--with-api-key'], input: 'sk-openai-good' })

  await assert.rejects(
    loginCodexWithApiKey({
      command: fixture.command,
      cwd: fixture.directory,
      apiKey: 'sk-openai-bad'
    }),
    error => {
      assert.match(error.message, /rejected the API key login/)
      assert.doesNotMatch(error.message, /sk-openai/)
      return true
    }
  )
  await assert.rejects(
    loginCodexWithApiKey({ command: fixture.command, cwd: fixture.directory, apiKey: '  ' }),
    /cannot be empty/
  )
})
