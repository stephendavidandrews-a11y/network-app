module.exports = {
  apps: [
    {
      name: 'network-app',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: '/opt/network-app',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
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
