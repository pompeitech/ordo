import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { demoRoot, userDataDirectory } from './paths.mjs'

function demoEditorRunning() {
  return spawnSync('pgrep', ['-f', userDataDirectory], { encoding: 'utf8' }).status === 0
}

/** Stops the demo's own VS Code instance and deletes the demo directory. */
export async function cleanDemo() {
  if (path.basename(demoRoot) !== 'ordo-demo') {
    throw new Error(`Refusing to delete ${demoRoot}: the demo directory must be named ordo-demo`)
  }
  if (process.platform !== 'win32' && demoEditorRunning()) {
    // Matches only processes started with the demo's own --user-data-dir.
    spawnSync('pkill', ['-f', userDataDirectory])
    for (let attempt = 0; attempt < 20 && demoEditorRunning(); attempt += 1) {
      await delay(250)
    }
  }
  const existed = existsSync(demoRoot)
  await rm(demoRoot, { recursive: true, force: true })
  return existed
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const existed = await cleanDemo()
  console.log(existed ? `Ordo demo removed: ${demoRoot}` : 'No Ordo demo to remove.')
}
