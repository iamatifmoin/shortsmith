# Shortsmith

A semi-automated, **human-in-the-loop** short-form video pipeline for a
**faceless** YouTube Shorts + Instagram Reels channel about **any niche**. You
clone it, run it locally, fill in your channel (subject, personality, branding,
sources, cadence) through the **setup wizard**, and it starts generating
review-ready videos for you. Nothing about the topic is hardcoded — the niche is
per-channel configuration.

> **Just want the daily workflow?** See the
> [operator guide](./docs/operator-guide.md). **Want the architecture?**
> [`CLAUDE.md`](./CLAUDE.md) is the orientation + index. This README is the
> **from-zero setup guide** — follow it top to bottom the first time.

## What it does

Three stages, two human gates. **Nothing auto-publishes without a human approving.**

1. **IDEATION** — web sources → review-ready scripts. Ends at **Gate 1 = script review**.
2. **RENDER** — an approved script → a finished vertical video (AI voiceover + captions + cleared background footage).
3. **PUBLISH** — the bot sends you the finished clip + copy-paste metadata on Telegram; you post it (**Gate 2 = finished-video review**) and reply `Scheduled`.

```
harvest → extract → rank → generate → review (Gate 1) → render → Telegram → you post (Gate 2)
```

---

# Setup — from zero to your first video

Takes about 20–30 minutes the first time, most of it signing up for free API keys.

## 1. Prerequisites (install these first)

| Tool | Why | Notes |
|------|-----|-------|
| **Node.js ≥ 22** | runs everything | [nodejs.org](https://nodejs.org) |
| **pnpm 10** | the package manager | `corepack enable` (ships with Node), or `npm i -g pnpm` |
| **Docker Desktop** | runs Postgres + Redis locally | [docker.com](https://www.docker.com/products/docker-desktop/) — start it before step 3 |
| **ffmpeg** | stitches audio + video in the renderer | must be on your `PATH`. Check with `ffmpeg -version`. ([download](https://ffmpeg.org/download.html)) |
| **Chrome or Edge** | Remotion renders in headless Chrome | any recent install is auto-detected; no extra step |

You also need **three free/cheap accounts** (set up in step 4):

- **Google AI Studio** — a free Gemini API key (writes the scripts).
- **ElevenLabs** — the voiceover. The **only metered/paid** service; a starter plan is cheap and the pipeline caches aggressively.
- **Telegram** — a bot that delivers finished clips to your phone. Free.

## 2. Install the code

```bash
git clone <your-fork-url> shortsmith
cd shortsmith
pnpm install
```

## 3. Start the databases

With Docker Desktop running:

```bash
docker compose up -d
```

This starts **PostgreSQL 16** (port 5432) and **Redis 7** (port 6379) in the
background. `pnpm dev` also does this for you, so this step is just to confirm
Docker is healthy. Stop them any time with `pnpm stop`.

## 4. Configure environment + keys

Copy the four example env files, then fill in your keys:

```bash
cp .env.example .env
cp apps/ideation/.env.example apps/ideation/.env
cp apps/render/.env.example apps/render/.env
cp apps/web/.env.local.example apps/web/.env.local
```

> **PowerShell:** use `Copy-Item .env.example .env` (and so on) instead of `cp`.

Now fill in the keys. The app **boots even with keys missing** — each unset
integration just no-ops — so you can add them as you go. You can also check all of
this later in the dashboard: the **Setup → Connections & keys** card shows which
are live.

### a) Script writer — Gemini (required to generate scripts)

1. Get a free key at **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**.
2. Put it in **`apps/ideation/.env`**:
   ```
   GEMINI_API_KEY="your-key-here"
   ```

> No key yet? Set `LLM_PROVIDER=manual` in the same file to paste completions by
> hand while you try it out.

### b) Voiceover — ElevenLabs (required to render video)

1. Sign up at **[elevenlabs.io](https://elevenlabs.io)**, open **Profile → API key**.
2. Put it in **`apps/render/.env`**:
   ```
   ELEVENLABS_API_KEY="your-key-here"
   ```
3. Optional: set `ELEVENLABS_VOICE_ID` to a voice you picked from the ElevenLabs
   Voice Library (a default is pre-filled).

### c) Publishing — Telegram bot (required to receive finished clips)

This is how finished clips reach your phone with copy-paste captions.

1. In Telegram, open **[@BotFather](https://t.me/BotFather)** → send `/newbot` →
   follow the prompts. It gives you a **bot token** like `123456:ABC-DEF…`.
2. Put the token in **`apps/ideation/.env`**:
   ```
   TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   ```
3. **Open a chat with your new bot and send it any message** (e.g. "hi"). The app
   reads that to learn your chat id automatically the first time it runs — or set
   it explicitly:
   ```
   TELEGRAM_CHAT_ID="your-chat-id"
   ```
   (Get the id by messaging [@userinfobot](https://t.me/userinfobot).)

Leave both blank to skip publish notifications while you try the rest.

### d) Background images — optional

B-roll images use keyless **Openverse** by default — nothing to do. For
higher-quality stock, add an **Unsplash** or **Pixabay** key to `apps/render/.env`
(`UNSPLASH_ACCESS_KEY` / `PIXABAY_API_KEY`).

## 5. Create the database schema

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

Run this once now, and again only after a schema change.

## 6. Build and run

```bash
pnpm -r build
pnpm dev
```

`pnpm dev` starts the databases and all three apps together:

| App | URL | What it is |
|-----|-----|-----------|
| **web** (dashboard) | http://localhost:3000 | where you click |
| **ideation** API | http://localhost:3001 | the pipeline + config API |
| **render** worker | http://localhost:3002 | makes the videos |

Leave that terminal running — it's your live log. Stop with **Ctrl-C**, then
`pnpm stop` to stop the containers.

## 7. Configure your channel (the setup wizard)

Open **http://localhost:3000**. On a fresh database it redirects to **`/setup`**.
Fill in, top to bottom:

- **Connections & keys** — confirms your Gemini / Telegram keys are live and links
  back here for any that aren't.
- **Channel basics** — name, description.
- **Your accounts** — your YouTube and Instagram handles/URLs.
- **What your videos are about** — the subject, other names it's known by, keywords to watch.
- **Tone & personality** — how the narrator should sound.
- **Fact-checking** — how confirmed a fact must be, and which source types to allow.
- **Sources** — the sites you trust (RSS where possible); "Open web" is a keyless fallback.
- **Upload defaults** — the disclaimer/tags added to every upload.
- **Posting schedule** — your timezone, audience timezone, post times, posts/day.

Press **Save**.

## 8. Set up background footage (the "master clip" → clip pool)

Every video plays **cleared, muted background footage** behind the voiceover — your
subject never appears on screen (that's the whole faceless model). You supply one
long source video (the **master clip**) and the `ingest` tool slices it into a
**pool** of short vertical clips the renderer draws from at random. Do this once
up front, then only when the pool runs low — it's occasional, not daily.

**What to use as a master clip**

- **Cleared or operator-owned footage only.** The classic choice is gameplay a
  publisher licenses for monetized video (e.g. Minecraft parkour — Mojang permits
  it), or footage you filmed/own yourself.
- **Never** copyrighted footage of your subject, and never ripped streamer clips.
- Landscape is fine — ingest center-crops it to vertical **9:16** and strips the audio.
- One good long source (10–30+ min) yields dozens of clips, so a single ingest lasts a while.

**Slice it into the pool** (build the render app once first):

```bash
pnpm --filter @shortsmith/render build
pnpm --filter @shortsmith/render ingest -- --file "C:\clips\mc-parkour.mp4" --game minecraft --clip-seconds 30
```

| Flag | Required | What it does | Default |
|------|----------|--------------|---------|
| `--file` | **yes** | path to your master clip on disk | — |
| `--source-url` | no | original URL — recorded for provenance + license-checked **only** (never downloaded) | — |
| `--game` | no | the pool folder the clips file under | `minecraft` |
| `--clip-seconds` | no | length of each sliced clip | `30` |
| `--assets-dir` | no | the assets root | `$ASSETS_DIR` or `./assets` |
| `--delete-source` | no | delete the big original after slicing (saves disk) | off |

**Where the clips go**

- Vertical, muted `.mp4` clips land in **`apps/render/assets/backgrounds/<game>/`**
  (named `<game>-<hash>-NNN.mp4`).
- Provenance (file, resolution, URL, license, clip count, date) is appended to
  **`apps/render/assets/backgrounds/LICENSES.md`**.
- If ingest prints **"⚠️ Standard YouTube License"**, only use that footage if it's
  **your own capture**.

**How the renderer uses the pool**

Each render picks clips **at random** from `backgrounds/<game>/` (quick-cut scenes
shuffle several). If the pool is empty the render fails with *"no background clips…
run ingest first"*, so ingest at least one master clip before your first render.
Keep `minecraft` as the folder name unless you deliberately run multiple pools.

> Clearance is yours to confirm (see [operations.md](./docs/operations.md)):
> cleared or owned, muted, **zero** copyrighted assets of your subject. Ingest
> handles the crop + mute; the rights call is yours. Full flag reference + the
> day-to-day version: [operator guide §3](./docs/operator-guide.md#3-add-background-footage-master-clip--clip-pool).

## 9. Run one full cycle

On the dashboard:

1. **Fetch new scripts** — runs harvest → extract → rank → generate; drafts land in **Review**.
2. **Review** tab — approve/reject drafts, then **Render** to commit (this is when ElevenLabs runs).
3. When a render finishes, your **Telegram bot** sends the clip + thumbnail + copy-paste title/description/tags/caption.
4. Upload to YouTube + Instagram, set each platform's native scheduler to the slot time, then reply **`Scheduled`** to the bot.

That's the daily loop. The full runbook is the [operator guide](./docs/operator-guide.md).

---

## Before you post publicly — platform accounts

- **YouTube:** to schedule natively you just need your channel. Mark the channel
  and videos **not made for kids**, and enable the **altered/synthetic content**
  disclosure (the voiceover is AI).
- **Instagram:** to schedule Reels you need a **Professional (Business/Creator)**
  account linked to a **Facebook Page** (also required for later API posting).

See [operations.md](./docs/operations.md) for the full compliance + per-clip
clearance checklist, and [go-live.md](./docs/go-live.md) for launch strategy.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Dashboard won't load / `ECONNREFUSED 3001` | the ideation app isn't up — check the `pnpm dev` log |
| `prisma migrate` can't connect | Docker isn't running, or `docker compose up -d` hasn't finished starting Postgres |
| Scripts never generate | Gemini key missing/invalid in `apps/ideation/.env` (or set `LLM_PROVIDER=manual`) |
| Render fails at voiceover | ElevenLabs key missing in `apps/render/.env` |
| Render fails spawning ffmpeg | `ffmpeg` not on `PATH` — install it, or set `FFMPEG_PATH` in `apps/render/.env` |
| No Telegram messages | token/chat id unset in `apps/ideation/.env`, or you haven't messaged the bot once |

## Repo map

```
apps/
  ideation/   NestJS + BullMQ + Prisma — pipeline + /channel config API
  web/        Next.js dashboard — review, publish, performance + /setup wizard
  render/     Remotion — approved script → vertical clip (ElevenLabs + ffmpeg)
packages/
  shared/     export-contract types + enums
  llm/        provider-agnostic LLM interface (Gemini default, + manual / Anthropic stub)
docs/         product / decisions / architecture / operator-guide / operations / …
docker-compose.yml   Postgres 16 + Redis 7
```

## Run it 24/7

To take it off your laptop onto a free always-on VM, see
[docs/deploy-oracle.md](./docs/deploy-oracle.md).

## Docs

- [Operator guide](./docs/operator-guide.md) · [Product](./docs/product.md) ·
  [Decisions](./docs/decisions.md) · [Architecture](./docs/architecture.md) ·
  [Sources](./docs/sources.md) · [Operations](./docs/operations.md) ·
  [Go-live](./docs/go-live.md) · [Shorts spec](./docs/shorts-spec.md) ·
  [Roadmap](./docs/roadmap.md)
