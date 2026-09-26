#!/usr/bin/env node

import { runCli } from './program.js'

const controller = new AbortController()
const abortOnInterrupt = () => controller.abort()
process.once('SIGINT', abortOnInterrupt)

try {
  process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal })
} finally {
  process.removeListener('SIGINT', abortOnInterrupt)
}
