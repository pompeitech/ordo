import { cp, mkdir, rm } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir('dist', { recursive: true })
await build({
  entryPoints: [
    'src/extension.ts',
    'src/plan-input.ts',
    'src/connections.ts',
    'src/profile-model.ts',
    'src/code-review-model.ts',
    'src/run-model.ts'
  ],
  outdir: 'dist',
  entryNames: '[name]',
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: 'node20'
})

// Ship Ordo's shared catalog so the team profile works in repositories without their own.
await rm('content', { recursive: true, force: true })
await cp('../../content', 'content', { recursive: true })
await cp('../../LICENSE', 'LICENSE')
