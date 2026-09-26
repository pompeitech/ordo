import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  claudeUsageFromRateLimitEvent,
  codexUsageFromRateLimits,
  defaultUsageStatePath,
  readCodexUsage,
  readRecordedUsage,
  recordAgentUsage,
  runClaudeCode
} from '../dist/index.js'

const temporaryDirectories = []
const NOW = new Date('2026-09-25T18:30:00.000Z')

after(async () => {
  await Promise.all(
    temporaryDirectories.map(directory => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-usage-'))
  temporaryDirectories.push(directory)
  return directory
}

async function createCommand(source) {
  const directory = await temporaryDirectory()
  const command = path.join(directory, 'fake-harness')
  await writeFile(command, `#!/usr/bin/env node\n${source}\n`)
  await chmod(command, 0o755)
  return { directory, command }
}

// Shapes captured from Claude Code 2.1.282 and codex-cli 0.157.0 (identifiers removed).
const claudeEvent = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed_warning',
    resetsAt: 1790442000,
    rateLimitType: 'seven_day',
    utilization: 0.79,
    isUsingOverage: false,
    surpassedThreshold: 0.75,
    unifiedWindows: {
      five_hour: { utilization: 0.06, resetsAt: 1790379000 },
      seven_day: { utilization: 0.79, resetsAt: 1790442000 }
    }
  }
}
const codexLimits = {
  rateLimits: {
    limitId: 'codex',
    primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1790379743 },
    secondary: { usedPercent: 97, windowDurationMins: 10080, resetsAt: 1790498185 },
    credits: { hasCredits: false, unlimited: false, balance: '0' },
    planType: 'plus'
  }
}

test('Claude rate limit events become five-hour and weekly percentages', () => {
  assert.deepEqual(claudeUsageFromRateLimitEvent(claudeEvent, NOW), {
    id: 'claude-code',
    source: 'last-run',
    observedAt: NOW.toISOString(),
    windows: [
      { kind: 'five-hour', usedPercent: 6, resetsAt: '2026-09-25T23:30:00.000Z' },
      { kind: 'weekly', usedPercent: 79, resetsAt: '2026-09-26T17:00:00.000Z' }
    ]
  })
  const single = claudeUsageFromRateLimitEvent(
    { rate_limit_info: { rateLimitType: 'seven_day_opus', utilization: 0.5 } },
    NOW
  )
  assert.deepEqual(single.windows, [{ kind: 'weekly-opus', usedPercent: 50, resetsAt: undefined }])
  assert.equal(claudeUsageFromRateLimitEvent({ type: 'rate_limit_event' }), undefined)
})

test('Codex limits keep plan and windows; no plan limits means no usage', () => {
  assert.deepEqual(codexUsageFromRateLimits(codexLimits, 'live', NOW), {
    id: 'codex',
    source: 'live',
    observedAt: NOW.toISOString(),
    plan: 'plus',
    windows: [
      { kind: 'five-hour', usedPercent: 0, resetsAt: '2026-09-25T23:42:23.000Z' },
      { kind: 'weekly', usedPercent: 97, resetsAt: '2026-09-27T08:36:25.000Z' }
    ]
  })
  assert.equal(codexUsageFromRateLimits({ rateLimits: null }, 'live'), undefined)
})

test('Codex usage is read live through app-server without starting a turn', async () => {
  const fixture = await createCommand(`
const readline = require('node:readline')
const methods = []
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  methods.push(message.method)
  if (message.method === 'turn/start' || message.method === 'thread/start') process.exit(9)
  if (message.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\\n')
  if (message.id === 2) process.stdout.write(JSON.stringify({ id: 2, result: ${JSON.stringify(codexLimits)} }) + '\\n')
})
`)
  const usage = await readCodexUsage({ command: fixture.command, cwd: fixture.directory })
  assert.equal(usage.source, 'live')
  assert.deepEqual(
    usage.windows.map(window => [window.kind, window.usedPercent]),
    [
      ['five-hour', 0],
      ['weekly', 97]
    ]
  )

  const failing = await createCommand(`
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  if (message.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\\n')
  if (message.id === 2) process.stdout.write(JSON.stringify({ id: 2, error: { message: 'no auth' } }) + '\\n')
})
`)
  assert.equal(
    await readCodexUsage({ command: failing.command, cwd: failing.directory }),
    undefined
  )
  assert.equal(
    await readCodexUsage({ command: path.join(tmpdir(), 'missing-codex'), cwd: tmpdir() }),
    undefined
  )
})

test('observed usage is stored per machine, privately, one entry per agent', async () => {
  const directory = await temporaryDirectory()
  const filePath = path.join(directory, 'state', 'usage.json')
  const claude = claudeUsageFromRateLimitEvent(claudeEvent, NOW)
  const codex = codexUsageFromRateLimits(codexLimits, 'last-run', NOW)

  await recordAgentUsage(claude, { filePath })
  await recordAgentUsage(codex, { filePath })

  assert.deepEqual(await readRecordedUsage('claude-code', { filePath }), claude)
  assert.deepEqual(await readRecordedUsage('codex', { filePath }), codex)
  assert.equal((await stat(filePath)).mode & 0o777, 0o600)
  assert.equal(
    await readRecordedUsage('claude-code', { filePath: path.join(directory, 'none.json') }),
    undefined
  )
  assert.equal(
    defaultUsageStatePath({ ORDO_STATE_DIR: '/state' }),
    path.join('/state', 'usage.json')
  )
  assert.equal(
    defaultUsageStatePath({ XDG_STATE_HOME: '/xdg' }),
    path.join('/xdg', 'ordo', 'usage.json')
  )
})

test('a Claude Code run reports plan usage as an event', async () => {
  const fixture = await createCommand(`
process.stdout.write(JSON.stringify(${JSON.stringify(claudeEvent)}) + '\\n')
process.stdout.write(JSON.stringify({ type: 'result', result: 'ok' }) + '\\n')
`)
  const events = []
  await runClaudeCode({
    command: fixture.command,
    cwd: fixture.directory,
    prompt: 'hello',
    onEvent: event => events.push(event)
  })
  const limits = events.find(event => event.type === 'usage-limits')
  assert.deepEqual(
    limits.usage.windows.map(window => [window.kind, window.usedPercent]),
    [
      ['five-hour', 6],
      ['weekly', 79]
    ]
  )
})
