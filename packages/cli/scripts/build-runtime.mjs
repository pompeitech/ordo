import { chmod, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(packageRoot, '../..')
const outputDirectory = path.join(packageRoot, 'dist')

await build({
  entryPoints: [path.join(packageRoot, 'src/bin.ts')],
  outfile: path.join(outputDirectory, 'bin.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20.12',
  packages: 'bundle',
  legalComments: 'none'
})

const bundledContent = path.join(outputDirectory, 'content')
await rm(bundledContent, { recursive: true, force: true })
await cp(path.join(workspaceRoot, 'content'), bundledContent, { recursive: true })
await chmod(path.join(outputDirectory, 'bin.js'), 0o755)
