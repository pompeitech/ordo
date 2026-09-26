import os from 'node:os'
import path from 'node:path'

// A short base path: macOS limits VS Code's IPC socket path to 103 characters.
export const demoRoot = path.resolve(
  process.env.ORDO_DEMO_DIR ??
    (process.platform === 'win32' ? path.join(os.tmpdir(), 'ordo-demo') : '/tmp/ordo-demo')
)
export const projectDirectory = path.join(demoRoot, 'checkout-service')
export const userDataDirectory = path.join(demoRoot, 'vscode', 'data')
export const extensionsDirectory = path.join(demoRoot, 'vscode', 'extensions')
