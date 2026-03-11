// Load ANTHROPIC_API_KEY from .env.local to prevent Claude Code's empty
// ANTHROPIC_API_KEY env var from overriding it at runtime.
const fs = require('fs')
const path = require('path')

const envFile = path.join(__dirname, '.env.local')
const envVars = {}
try {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=["']?(.+?)["']?\s*$/)
    if (match) envVars[match[1]] = match[2]
  }
} catch { /* ignore if .env.local missing */ }

module.exports = {
  apps: [
    {
      name: 'network-app',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/Users/stephen/Documents/Website/network',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Explicitly pass API key so PM2 restarts don't lose it
        ANTHROPIC_API_KEY: envVars.ANTHROPIC_API_KEY || '',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/network-app/error.log',
      out_file: '/var/log/network-app/out.log',
      merge_logs: true,
    },
  ],
}
