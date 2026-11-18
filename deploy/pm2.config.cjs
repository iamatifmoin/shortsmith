// PM2 process set for the single-VM deploy (docs/deploy-oracle.md).
//
// Runs the three always-on apps that `pnpm dev` runs locally — the ideation API
// (BullMQ worker + Telegram getUpdates poller + briefing/reminder sweeps), the
// render worker (Remotion + ffmpeg), and the Next.js dashboard — under one
// supervisor that restarts them on crash and on VM reboot.
//
// Each app loads its OWN apps/<app>/.env (ideation & render via @nestjs/config,
// web via Next's .env.local), exactly as in local dev, so PM2 only needs the
// right working directory per app. No secrets live in this file.
//
// Usage (from the repo root, after `pnpm -r build`):
//   pm2 start deploy/pm2.config.cjs
//   pm2 save           # persist the process list across reboots
//   pm2 startup        # print the one command to enable the boot service
//
// Paths are resolved relative to this file so it works regardless of CWD.
const path = require('node:path');
const root = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'ideation',
      cwd: path.join(root, 'apps', 'ideation'),
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '1G',
      time: true,
    },
    {
      name: 'render',
      cwd: path.join(root, 'apps', 'render'),
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      // Remotion renders in headless Chrome; give it generous headroom before a
      // restart. The Ampere A1 free VM has up to 24 GB, so this is comfortable.
      max_memory_restart: '3G',
      time: true,
    },
    {
      name: 'web',
      cwd: path.join(root, 'apps', 'web'),
      // Run the workspace's own `next start -p 3000` (see apps/web/package.json).
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
