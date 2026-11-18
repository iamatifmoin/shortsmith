# Deploy to a free, always-on VM (Oracle Cloud Always Free)

> Goal: run the **whole pipeline 24/7, reachable from anywhere, for $0** — without
> dropping a single feature — so it no longer depends on your laptop being on.
> This is a **lift-and-shift**: the VM runs the same `apps` + Postgres + Redis the
> same way your laptop does. The only metered cost stays what it already is —
> **ElevenLabs** (Gemini and Telegram are free).

All deploy artifacts referenced here live in [`deploy/`](../deploy). The companion
day-to-day runbook is [operator-guide.md](./operator-guide.md); this file is only
"how do I get it running in the cloud and keep it there".

---

## Why a single VM (and not the usual "free PaaS" split)

Three properties of this app decide the hosting:

1. **Two processes must run 24/7, not on-demand.** The ideation API runs a BullMQ
   worker, a Telegram `getUpdates` poller, and timed sweeps for the **09:00
   briefing / 21:00 reminders / slot catch-up** ([phase-4-publish.md](./phase-4-publish.md)).
   The render worker is a long-running BullMQ consumer. A host that **sleeps on
   inactivity** (most free PaaS tiers) silently breaks reminders and missed-reply
   handling.
2. **Rendering is heavy** — Remotion = headless Chromium + ffmpeg, which OOMs a
   512 MB free container.
3. **There is real file state** — the `assets/backgrounds/` clip pool and the
   transient `.mp4`/thumbnail outputs want a persistent disk.

**Oracle Cloud's Always Free tier** gives an Ampere **ARM VM up to 4 cores / 24 GB
RAM + ~200 GB disk, free indefinitely** (not a trial) — the only mainstream free
offer large enough to hold the render worker and stay always-on. One box runs
everything, so there is nothing to re-architect and no feature is lost.

> If you ever want less server-wrangling and will accept a few dollars a month, the
> same artifacts port to Fly.io (two always-on machines + a volume). Out of scope
> here; this guide is the strictly-free path.

---

## What runs where

| Piece | On the VM | Port (localhost only) |
|---|---|---|
| Postgres 16 + Redis 7 | Docker (`deploy/docker-compose.prod.yml`) | 5432 / 6379, bound to 127.0.0.1 |
| ideation API (worker + Telegram poll + sweeps) | PM2 `ideation` | 3001 |
| render worker (Remotion + ffmpeg) | PM2 `render` | 3002 |
| web dashboard (Next.js) | PM2 `web` | 3000 |
| footage pool + render outputs | VM disk | — |
| access from anywhere | Cloudflare Tunnel → dashboard | HTTPS, no open ports |

Telegram needs **no** public URL or webhook — it polls outbound, so it works from
a VM behind NAT unchanged.

---

## 1. Create the VM

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com) (a card is required for
   identity verification; Always Free resources are not charged).
2. **Compute → Instances → Create instance.**
   - **Image:** Ubuntu 22.04 (or 24.04).
   - **Shape:** change to **Ampere (Arm) → VM.Standard.A1.Flex**, set **4 OCPU /
     24 GB** (the whole Always-Free allowance on one VM).
   - **Networking:** keep the auto-created VCN; add your SSH public key.
   - **Boot volume:** bump to ~100–200 GB (within the free 200 GB block storage).
3. Create, then note the **public IP**. SSH in: `ssh ubuntu@<public-ip>`.

> **Capacity tip:** A1 instances are popular and a region can report "out of
> capacity". Retry, or pick a different availability domain / home region.

> **Idle-reclaim tip:** Oracle may reclaim *idle* Always-Free compute. A box that
> renders daily rarely qualifies, but it's a known gotcha — don't leave it parked
> empty for weeks.

---

## 2. Provision (one time)

On the VM:

```bash
git clone https://github.com/<you>/shortsmith.git
cd shortsmith
bash deploy/provision.sh
```

This installs Node 22, pnpm, Docker + compose, ffmpeg, the headless-Chromium
system libraries, and PM2. **Log out and back in once** afterwards so your user
picks up the `docker` group.

---

## 3. Clone and configure (secrets + paths)

The apps read their **own** `.env` files exactly as they do locally. Create the
three, starting from the committed examples:

```bash
cp .env.example .env
cp apps/ideation/.env.example apps/ideation/.env
cp apps/render/.env.example   apps/render/.env
cp apps/web/.env.local.example apps/web/.env.local
```

Then edit them. **`DATABASE_URL` / `REDIS_URL` / the `localhost` API URLs stay as
they are** — everything is on this one VM. Set only:

- `apps/ideation/.env` → `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, (optionally)
  `TELEGRAM_CHAT_ID`.
- `apps/render/.env` → `ELEVENLABS_API_KEY`. Leave `REMOTION_CHROME` **unset** so
  Remotion uses the managed Chrome that `deploy/deploy.sh` downloads. Point the
  footage/output dirs at the data disk so they survive and don't fill `$HOME`:
  ```
  ASSETS_DIR="/home/ubuntu/shortsmith-data/assets"
  OUTPUT_DIR="/home/ubuntu/shortsmith-data/out"
  ```
  then `mkdir -p /home/ubuntu/shortsmith-data/{assets,out}`.
- `apps/web/.env.local` → leave `IDEATION_API_URL=http://localhost:3001`.

> **Postgres password (optional hardening):** the DB is bound to 127.0.0.1 and not
> reachable from the internet, so the dev default is acceptable. To change it, set
> `POSTGRES_PASSWORD` before `docker compose up` and update `DATABASE_URL` to match.

---

## 4. First deploy

```bash
bash deploy/deploy.sh
```

It brings up Postgres + Redis, installs deps, runs `prisma migrate deploy`, builds
all workspaces, ensures Remotion's browser, and starts the three apps under PM2.
Finish by enabling boot-persistence so the stack survives a reboot:

```bash
pm2 save
pm2 startup        # run the single sudo command it prints
```

Check it:

```bash
pm2 status                       # ideation / render / web all "online"
curl -s localhost:3001/health    # ideation API
curl -s localhost:3000           # dashboard HTML
```

---

## 5. Access the dashboard from anywhere (Cloudflare Tunnel)

This exposes **only** `localhost:3000` over HTTPS — no inbound ports opened, API
and render worker stay private.

```bash
# install cloudflared (arm64)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo install cloudflared /usr/local/bin/cloudflared

cloudflared tunnel login
cloudflared tunnel create shortsmith
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml
# edit ~/.cloudflared/config.yml: paste the tunnel ID + credentials path, set your hostname
cloudflared tunnel route dns shortsmith shortsmith.<your-domain>
sudo cloudflared service install      # runs on boot
```

No domain? Use a throwaway URL for testing:
`cloudflared tunnel --url http://localhost:3000` prints a `*.trycloudflare.com`
address.

> **Lock it to just you:** in the Cloudflare Zero Trust dashboard add an **Access**
> application over that hostname with a one-member email policy. Then only your
> email (via a one-time code) can open the dashboard — important, since the UI has
> no auth of its own.

---

## 6. Day-to-day on the VM

Everything in [operator-guide.md](./operator-guide.md) still applies; the commands
just change from `pnpm dev` to PM2:

| I want to… | On the VM |
|---|---|
| See status / health | `pm2 status` |
| Tail live logs (your old `pnpm dev` terminal) | `pm2 logs` (or `pm2 logs render`) |
| Restart one app after a config edit | `pm2 restart ideation` |
| Add background footage | `pnpm --filter @shortsmith/render ingest -- --file "/home/ubuntu/shortsmith-data/src.mp4" --game minecraft` |
| Change slots / cadence | edit `apps/ideation/src/config/publishing.ts`, then `bash deploy/deploy.sh` (rebuild) |
| Deploy an update | `bash deploy/deploy.sh` |
| Stop data services | `docker compose -f deploy/docker-compose.prod.yml down` |

Fetch → Review → Render → Telegram publish all work identically; you just open the
dashboard at your Cloudflare hostname instead of `localhost:3000`, and the Telegram
batch comes to your phone as before — now independent of your laptop.

---

## 7. Backups (worth 2 minutes)

Postgres holds the pipeline state (scripts, publish tasks, metrics). A nightly dump
to the data disk:

```bash
echo '0 3 * * * docker exec shortsmith-postgres pg_dump -U shortsmith shortsmith | gzip > /home/ubuntu/shortsmith-data/db-$(date +\%F).sql.gz' | crontab -
```

The footage pool and finished clips are reproducible (re-ingest / re-render), so
the database is the thing worth dumping. For off-box safety, copy the dumps to
Cloudflare R2 or Backblaze B2 (both have free tiers) occasionally.

---

## 8. Troubleshooting

- **A render fails with a missing `.so` / Chrome won't launch** — a Chromium system
  lib is missing for your Ubuntu version. Re-run `bash deploy/provision.sh`; the
  failing lib name is in `pm2 logs render`.
- **`remotion browser ensure` can't download** — set `REMOTION_CHROME` in
  `apps/render/.env` to a system Chromium path and `pm2 restart render`.
- **Reminders/briefings never fire** — the ideation process isn't running 24/7.
  `pm2 status` must show `ideation` **online**; confirm `pm2 save` + `pm2 startup`
  were done so it survives reboots.
- **Dashboard unreachable** — `sudo systemctl status cloudflared`; the Access
  policy may be blocking the email you're signing in with.
