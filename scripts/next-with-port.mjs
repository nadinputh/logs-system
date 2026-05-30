import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const envFiles = ['.env', '.env.local']
for (const file of envFiles) {
  if (existsSync(file) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(file)
  }
}

const mode = process.argv[2]
const extraArgs = process.argv.slice(3)
const port = process.env.PORT || '4000'
const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')

let nextArgs
if (mode === 'dev') {
  nextArgs = ['dev', '--hostname', '0.0.0.0', '-p', port]
} else if (mode === 'start') {
  nextArgs = ['start', '-p', port]
} else {
  console.error('Usage: node scripts/next-with-port.mjs <dev|start> [extra args...]')
  process.exit(1)
}

const child = spawn(process.execPath, [nextBin, ...nextArgs, ...extraArgs], {
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
