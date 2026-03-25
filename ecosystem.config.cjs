/**
 * PM2 Ecosystem Config — FynBack
 *
 * Two processes:
 *   fynback-web    → Next.js dashboard (port 3000, proxied by Nginx)
 *   fynback-worker → BullMQ worker (tsx, runs from source)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs        # first time
 *   pm2 restart ecosystem.config.cjs      # after deploy
 *   pm2 save                              # persist across reboots
 */

const APP_ROOT = '/var/www/fynback';

module.exports = {
  apps: [
    {
      name: 'fynback-web',
      cwd: `${APP_ROOT}/apps/web`,
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: `${APP_ROOT}/logs/web-error.log`,
      out_file: `${APP_ROOT}/logs/web-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    {
      name: 'fynback-worker',
      cwd: `${APP_ROOT}/apps/worker`,
      // Runs the compiled JS bundle (built by tsup).
      // fork_mode required — cluster_mode only works with plain JS entry points,
      // not shell script wrappers like tsx.
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: `${APP_ROOT}/logs/worker-error.log`,
      out_file: `${APP_ROOT}/logs/worker-out.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
