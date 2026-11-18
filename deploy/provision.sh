#!/usr/bin/env bash
# One-time provisioning for a fresh Oracle Cloud "Always Free" Ampere A1 VM
# (Ubuntu 22.04/24.04, arm64). Installs everything the pipeline needs:
# Node 22, pnpm (via corepack), Docker + compose, ffmpeg, and the system
# libraries headless Chromium needs for Remotion rendering.
#
# Safe to re-run. Run as a sudo-capable user (NOT root):  bash deploy/provision.sh
#
# After this finishes, log out/in once (so the docker group applies), then follow
# docs/deploy-oracle.md from "Clone and configure".
set -euo pipefail

echo "==> Updating apt and base tooling"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates git ufw unzip

echo "==> Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> pnpm via corepack"
sudo corepack enable
corepack prepare pnpm@10.28.1 --activate
echo "    pnpm $(pnpm -v)"

echo "==> Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true
sudo systemctl enable --now docker

echo "==> ffmpeg (audio stitch / video mux)"
sudo apt-get install -y ffmpeg

echo "==> Headless-Chromium runtime libraries (for Remotion rendering)"
# Remotion downloads its own Chrome Headless Shell (see deploy.sh), but that binary
# still needs these shared libs + fonts present on the host. Names cover both the
# 22.04 and 24.04 (t64) package sets; the `|| true` lets the alternate name win.
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libatspi2.0-0 libxshmfence1 fonts-liberation fonts-noto-color-emoji \
  || true
sudo apt-get install -y libasound2t64 || sudo apt-get install -y libasound2 || true

echo "==> PM2 (process supervisor)"
sudo npm install -g pm2

echo
echo "Provisioning complete."
echo "  * Log OUT and back IN once so the 'docker' group takes effect."
echo "  * Then continue with docs/deploy-oracle.md -> 'Clone and configure'."
