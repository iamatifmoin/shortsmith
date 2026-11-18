#!/usr/bin/env bash
# Build + (re)start the whole stack on the VM. Run from the repo root:
#   bash deploy/deploy.sh
#
# Use it for the first deploy AND for every update afterwards (it pulls, rebuilds,
# applies any new migration, and hot-reloads the processes with zero data loss).
# Idempotent and safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

echo "==> Pulling latest"
git pull --ff-only || echo "    (skipped git pull — not a fast-forward; resolve manually)"

echo "==> Bringing up Postgres + Redis (docker)"
docker compose -f deploy/docker-compose.prod.yml up -d

echo "==> Installing workspace dependencies"
pnpm install --frozen-lockfile

echo "==> Prisma client + migrations (deploy = non-interactive, prod-safe)"
pnpm --filter @shortsmith/ideation prisma generate
pnpm --filter @shortsmith/ideation prisma migrate deploy

echo "==> Building all workspaces"
pnpm -r build

echo "==> Ensuring Remotion's headless Chrome is present"
# Downloads Chrome Headless Shell into Remotion's cache if missing. Leave
# REMOTION_CHROME unset in apps/render/.env to use this managed binary.
pnpm --filter @shortsmith/render exec remotion browser ensure || \
  echo "    (could not ensure Remotion browser — set REMOTION_CHROME to a system Chromium instead)"

echo "==> Starting / reloading PM2 processes"
if pm2 describe ideation >/dev/null 2>&1; then
  pm2 reload deploy/pm2.config.cjs --update-env
else
  pm2 start deploy/pm2.config.cjs
fi
pm2 save

echo
echo "Deploy complete. Status:"
pm2 status
echo
echo "Dashboard is on http://127.0.0.1:3000 (expose it via Cloudflare Tunnel — see docs/deploy-oracle.md)."
