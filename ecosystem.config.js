module.exports = {
  apps: [
    {
      name: 'ipro-api',
      script: 'apps/api/dist/index.js',
      cwd: '/opt/ipro',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/opt/ipro/logs/api-error.log',
      out_file: '/opt/ipro/logs/api-out.log',
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
};
