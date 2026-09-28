// Renders the Ordo page outside VS Code with the demo data and takes screenshots at
// several window sizes, so layout changes can be checked without starting the editor.
//
//   pnpm --filter ordo preview            # writes $TMPDIR/ordo-preview (or ORDO_PREVIEW_DIR)
//   ORDO_PREVIEW_TABS=chat,workflow pnpm --filter ordo preview
//
// It needs Google Chrome (or ORDO_PREVIEW_CHROME) for the screenshots; the HTML files
// open in any browser.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(extensionRoot, '../..')
const outputDirectory = process.env.ORDO_PREVIEW_DIR ?? path.join(tmpdir(), 'ordo-preview')
const require = createRequire(import.meta.url)

const TABS = (process.env.ORDO_PREVIEW_TABS ?? 'overview,chat,workflow,profile,connections').split(
  ','
)
const SIZES = [
  [1440, 900],
  [1024, 768],
  [760, 900],
  [500, 860]
]

// VS Code "Dark Modern" colors for every variable the page uses.
const THEME = {
  'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'editor-font-family': 'Menlo, Consolas, monospace',
  foreground: '#cccccc',
  descriptionForeground: '#9d9d9d',
  errorForeground: '#f85149',
  focusBorder: '#0078d4',
  'editor-background': '#1f1f1f',
  'editorWidget-background': '#202020',
  'editorWarning-foreground': '#cca700',
  'sideBar-background': '#181818',
  'sideBar-border': '#2b2b2b',
  'panel-border': '#2b2b2b',
  'widget-shadow': 'rgba(0,0,0,.36)',
  'button-background': '#0078d4',
  'button-foreground': '#ffffff',
  'button-hoverBackground': '#026ec1',
  'button-border': 'rgba(255,255,255,.07)',
  'button-secondaryBackground': '#313131',
  'button-secondaryForeground': '#cccccc',
  'button-secondaryHoverBackground': '#3c3c3c',
  'badge-background': '#616161',
  'badge-foreground': '#f8f8f8',
  'input-background': '#313131',
  'input-border': '#3c3c3c',
  'input-foreground': '#cccccc',
  'dropdown-background': '#313131',
  'dropdown-border': '#3c3c3c',
  'list-hoverBackground': '#2a2d2e',
  'list-activeSelectionBackground': '#04395e',
  'list-activeSelectionForeground': '#ffffff',
  'list-inactiveSelectionBackground': '#37373d',
  'textCodeBlock-background': '#2b2b2b',
  'charts-blue': '#3794ff',
  'charts-green': '#89d185',
  'charts-orange': '#d18616',
  'charts-purple': '#b180d7',
  'charts-red': '#f14c4c',
  'charts-yellow': '#cca700'
}

async function pageAssets() {
  const result = await build({
    entryPoints: [path.join(extensionRoot, 'src/webview.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'error'
  })
  const source = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

async function demoProject() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ordo-preview-'))
  const run = (...args) => spawnSync('git', args, { cwd: directory, encoding: 'utf8' })
  run('init', '-q')
  run('config', 'user.name', 'Ordo Preview')
  run('config', 'user.email', 'preview@example.invalid')
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'checkout-service', dependencies: { fastify: '^5.0.0' } })
  )
  const { createDemoScenario } = await import(
    pathToFileURL(path.join(repositoryRoot, 'scripts/demo/scenario.mjs')).href
  )
  const ids = await createDemoScenario(directory)
  return { directory, ...ids }
}

function connectionFixtures() {
  const common = { configuredPath: '', hasStoredApiKey: false, billing: 'plan' }
  return [
    {
      ...common,
      id: 'claude-code',
      name: 'Claude Code',
      status: 'connected',
      command: 'claude',
      version: '2.1.283 (Claude Code)',
      auth: 'Signed in via claude.ai',
      message: 'Claude Code is connected.',
      apiKeyProvider: 'Anthropic',
      apiKeyStorage: 'ordo-keychain'
    },
    {
      ...common,
      id: 'codex',
      name: 'Codex',
      status: 'connected',
      command: 'codex',
      version: 'codex-cli 0.157.0',
      auth: 'Signed in via ChatGPT',
      message: 'Codex is connected.',
      apiKeyProvider: 'OpenAI',
      apiKeyStorage: 'harness'
    }
  ]
}

function usageFixtures() {
  const inHours = hours => new Date(Date.now() + hours * 3_600_000).toISOString()
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      billing: 'plan',
      source: 'last-run',
      observedAt: new Date(Date.now() - 7_200_000).toISOString(),
      windows: [
        { kind: 'five-hour', usedPercent: 13, resetsAt: inHours(3) },
        { kind: 'weekly', usedPercent: 82, resetsAt: inHours(52) }
      ]
    },
    {
      id: 'codex',
      name: 'Codex',
      billing: 'plan',
      source: 'live',
      observedAt: new Date().toISOString(),
      windows: [
        { kind: 'five-hour', usedPercent: 4, resetsAt: inHours(4) },
        { kind: 'weekly', usedPercent: 97, resetsAt: inHours(20) }
      ]
    }
  ]
}

function chatFixtures(projectRoot) {
  const at = minutes => new Date(Date.now() - minutes * 60_000).toISOString()
  const id = '3f2b8c1e-8a4d-4f7e-9c1a-2b3c4d5e6f70'
  const messages = [
    { id: '1', role: 'user', text: 'Where are card numbers validated?', at: at(12) },
    {
      id: '2',
      role: 'agent',
      agent: 'claude-code',
      text: 'Card numbers are validated in `isValidCard` in `src/legacy-validation.ts:1`. It only checks the length:\n\n```ts\nexport const isValidCard = (card: string) => card.length === 16\n```\n\nThere is no Luhn checksum, so a 16-character string such as `abcdefghijklmnop` passes, and 15-digit American Express cards are rejected. `src/checkout.ts` calls `saveOrder` directly without calling it at all.',
      at: at(11),
      inputTokens: 18_400,
      outputTokens: 320
    },
    { id: '3', role: 'user', text: 'Would a Luhn check fit there? Keep it short.', at: at(4) },
    {
      id: '4',
      role: 'agent',
      agent: 'codex',
      text: 'Yes. Replace the length check with a digits-only check plus Luhn, and call it from `checkout` before `saveOrder`. Keep 15 and 16 digits valid so American Express still works.',
      at: at(3)
    }
  ]
  const thread = {
    schemaVersion: 1,
    id,
    title: 'Where are card numbers validated?',
    projectRoot,
    createdAt: at(12),
    updatedAt: at(3),
    nativeSessions: { 'claude-code': 's1', codex: 't1' },
    seen: { 'claude-code': 2, codex: 4 },
    messages
  }
  const summaries = [
    { id, title: thread.title, updatedAt: at(3), messageCount: 4, lastAgent: 'codex' },
    {
      id: '9a8b7c6d-1111-4222-8333-444455556666',
      title: 'How does the errors step map 422 responses to the reason field?',
      updatedAt: at(60 * 26),
      messageCount: 6,
      lastAgent: 'claude-code'
    },
    {
      id: '1b2c3d4e-5555-4666-8777-888899990000',
      title: 'Summarize the Safe checkout spec',
      updatedAt: at(60 * 72),
      messageCount: 2,
      lastAgent: 'codex'
    }
  ]
  return {
    id,
    messages: [
      { type: 'chats', chats: summaries, harnesses: harnessOptions() },
      {
        type: 'chat',
        chat: {
          thread,
          handoff: {
            'claude-code': { messages: 2, estimatedTokens: 64 },
            codex: { messages: 0, estimatedTokens: 0 }
          }
        }
      }
    ]
  }
}

function harnessOptions() {
  return connectionFixtures().map(connection => ({
    id: connection.id,
    name: connection.name,
    connected: true,
    detail: `${connection.version} · ${connection.auth}`
  }))
}

async function hostMessages(project) {
  const core = await import(
    pathToFileURL(path.join(repositoryRoot, 'packages/core/dist/index.js')).href
  )
  const profileModel = require(path.join(extensionRoot, 'dist/profile-model.js'))
  const root = project.directory
  const [context, specs, explorations, architectures, plans, sessions, profile] = await Promise.all(
    [
      core.inspectProjectContext(root),
      core.listSpecs(root),
      core.listExplores(root),
      core.listArchitectureProposals(root),
      core.listPlans(root),
      core.listSessions(root),
      core.readProjectProfile(root)
    ]
  )
  const contentRoot = path.join(repositoryRoot, 'content')
  const catalog = await core.loadCatalog(contentRoot)
  const errors = (await core.validateProjectProfile(root, contentRoot)).errors
  const suggestions = await core.suggestProfileEntries(root, catalog.entries, profile)
  const workflow = (await core.workflowStatus(root)).items
  const trail = await core.workflowTrail(root, project.specId)
  const chats = chatFixtures(root)
  return {
    selectedKey: workflow.find(item => item.specId === project.specId)?.key,
    chatId: chats.id,
    messages: [
      {
        type: 'snapshot',
        snapshot: {
          repositoryName: 'checkout-service',
          repositoryRoot: root,
          context,
          specs,
          explorations,
          architectures,
          plans,
          sessions,
          profile: { state: 'ok', summary: profileModel.summarizeProfile(profile) }
        }
      },
      { type: 'connections', connections: connectionFixtures() },
      { type: 'usage', usage: usageFixtures() },
      {
        type: 'profile',
        view: profileModel.buildProfileView(
          catalog.entries,
          profile,
          errors,
          { root: contentRoot, source: 'repository' },
          suggestions
        )
      },
      { type: 'workflow', items: workflow },
      { type: 'trail', trail },
      ...chats.messages
    ]
  }
}

function pageHtml(assets, data, tab) {
  const theme = Object.entries(THEME)
    .map(([name, value]) => `--vscode-${name}:${value}`)
    .join(';')
  const state = {
    tab,
    selectedKey: data.selectedKey,
    chatId: data.chatId,
    chatAgent: 'claude-code'
  }
  // `</` would end the inline script early.
  const json = value => JSON.stringify(value).replace(/<\//g, '<\\/')
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Ordo preview · ${tab}</title>
<style>:root{${theme}}</style><style>${assets.pageStyles}</style></head>
<body><div id="app"></div>
<script>
window.acquireVsCodeApi = () => ({ postMessage() {}, getState: () => (${json(state)}), setState() {} });
</script>
<script>${assets.pageClient}</script>
<script>for (const message of ${json(data.messages)}) { window.postMessage(message, '*') }</script>
</body></html>
`
}

function chromePath() {
  const candidates = [
    process.env.ORDO_PREVIEW_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'google-chrome',
    'chromium'
  ].filter(Boolean)
  return candidates.find(candidate => !candidate.includes('/') || existsSync(candidate))
}

/** How many pixels the page is wider than the window: anything above 0 scrolls sideways. */
function horizontalOverflow(chrome, file, width, height) {
  const probe = file.replace(/\.html$/, '.probe.html')
  const measure =
    '<script>setTimeout(() => document.body.setAttribute("data-overflow", ' +
    'document.documentElement.scrollWidth - innerWidth), 300)</script></body>'
  writeFileSync(probe, readFileSync(file, 'utf8').replace('</body>', measure))
  const result = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--virtual-time-budget=1500',
      `--window-size=${width},${height}`,
      '--dump-dom',
      pathToFileURL(probe).href
    ],
    { encoding: 'utf8' }
  )
  unlinkSync(probe)
  return Number(/data-overflow="(-?\d+)"/.exec(result.stdout)?.[1] ?? 0)
}

const assets = await pageAssets()
const project = await demoProject()
try {
  const data = await hostMessages(project)
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  const chrome = chromePath()
  for (const tab of TABS) {
    const file = path.join(outputDirectory, `${tab}.html`)
    await writeFile(file, pageHtml(assets, data, tab))
    for (const [width, height] of SIZES) {
      const screenshot = path.join(outputDirectory, `${tab}-${width}.png`)
      const result = spawnSync(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--allow-file-access-from-files',
          '--virtual-time-budget=1500',
          `--window-size=${width},${height}`,
          `--screenshot=${screenshot}`,
          pathToFileURL(file).href
        ],
        { encoding: 'utf8' }
      )
      if (result.status !== 0) {
        console.error(`Screenshot failed for ${tab} at ${width}px: ${result.stderr.trim()}`)
      }
      const overflow = horizontalOverflow(chrome, file, width, height)
      if (overflow) {
        console.warn(`${tab} at ${width}px is ${overflow}px wider than the window`)
      }
    }
  }
  console.log(`Preview written to ${outputDirectory}`)
} finally {
  await rm(project.directory, { recursive: true, force: true })
}
