import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanDemo } from './clean.mjs'
import { extensionsDirectory, projectDirectory, userDataDirectory } from './paths.mjs'
import { createDemoScenario } from './scenario.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vsix = path.join(repositoryRoot, 'packages/vscode-ordo/ordo.vsix')
const code = process.env.ORDO_DEMO_CODE ?? 'code'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0]} failed: ${(result.stderr || result.stdout || '').trim()}`
    )
  }
  return result.stdout.trim()
}

if (!existsSync(vsix)) {
  console.error('ordo.vsix is missing. Run `pnpm ordo:demo`, which packages the extension first.')
  process.exit(2)
}

await cleanDemo()
await mkdir(projectDirectory, { recursive: true })
run('git', ['init', '-q'], { cwd: projectDirectory })
if (
  !spawnSync('git', ['config', 'user.name'], {
    cwd: projectDirectory,
    encoding: 'utf8'
  }).stdout.trim()
) {
  run('git', ['config', 'user.name', 'Ordo Demo'], { cwd: projectDirectory })
  run('git', ['config', 'user.email', 'demo@example.invalid'], { cwd: projectDirectory })
}
await writeFile(
  path.join(projectDirectory, 'package.json'),
  `${JSON.stringify(
    {
      name: 'checkout-service',
      private: true,
      dependencies: { fastify: '^5.0.0', mongodb: '^6.9.0' },
      devDependencies: { typescript: '^5.9.0' }
    },
    null,
    2
  )}\n`
)
const { specId, planId } = await createDemoScenario(projectDirectory)
run('git', ['add', '-A'], { cwd: projectDirectory })
run('git', ['commit', '-q', '-m', 'Checkout service with Ordo artifacts'], {
  cwd: projectDirectory
})

const editorArgs = [
  `--user-data-dir=${userDataDirectory}`,
  `--extensions-dir=${extensionsDirectory}`
]
const hasCode = spawnSync(code, ['--version'], { encoding: 'utf8' }).status === 0
if (hasCode) {
  run(code, [...editorArgs, '--install-extension', vsix, '--force'])
  run(code, [...editorArgs, '--disable-workspace-trust', '--new-window', projectDirectory])
}

const cli = `node ${path.join(repositoryRoot, 'packages/cli/dist/bin.js')}`
console.log(`
Ordo demo ready: ${projectDirectory}
${
  hasCode
    ? 'A separate VS Code window is open with Ordo installed (your own editor is untouched).'
    : `VS Code's \`code\` command was not found. Install ${vsix} in your editor and open the folder above.`
}

What to show:
  1. Ordo icon in the Activity Bar → Overview: requirements, team profile, AI connections and plan usage.
  2. Workflow: each requirement across brainstorm → … → record, what blocks it and the next step.
  3. Click "Safe checkout" → Replay: press ▶, filter "Human decisions", spot the run with the most tokens.
  4. "Review step" on "errors": a Code review panel opens in the page. "Diff" shows each file
     beside it. Uncheck README.md (the agent rewrote it for no reason), keep "Approve" and press
     "Undo 1 file and submit review"; the replay shows what was kept and what was undone.
  5. After approving "errors", press "Run \"logging\"": a Run panel opens. Pick the agent, read the
     token estimate bar, press Start and follow the output; the code review follows in the same
     panel. This starts a real agent on your own Claude Code or Codex plan.
  6. Team profile: the shared agents, skills and rules, with suggestions for Fastify, MongoDB
     and TypeScript.
  7. Chat: choose Claude Code and ask "What is Safe checkout about?", then switch to Codex and ask
     "What is still missing?". Codex gets the earlier messages; nothing in the project changes.
     This uses your own plan, like a run.

Same data from the terminal:
  cd ${projectDirectory}
  ${cli} status
  ${cli} status --spec ${specId}
  ${cli} plan changes ${planId} --step-id errors --diff
  ${cli} plan review ${planId} --step-id errors --decision approved --reject README.md

Agent runs in this demo are simulated (made-up token counts); everything else goes through the real Ordo core.
Remove it with: pnpm ordo:demo:clean
`)
