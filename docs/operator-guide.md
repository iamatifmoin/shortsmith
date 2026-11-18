# Operator guide — running the channel day to day

> This is your **runbook**: every step where a human (you) is in the loop, with
> the exact command or click. If something here disagrees with the code, the code
> wins — tell me and I'll fix the doc. Design rationale lives in
> [phase-4-publish.md](./phase-4-publish.md) and the ADRs in
> [decisions.md](./decisions.md); this file is only "how do I actually do X".

**Mental model in one line:** you feed the machine *background footage* once in a
while, then each day you *fetch → review → render → schedule*, and Telegram walks
you through the scheduling.

---

## The next step (where we are right now)

Phase 4 is built, committed, and tested end-to-end with a real Telegram round-trip.
Nothing is left for me to build before you can run it for real. The next step is
**yours**, and it's a real dry run before the Nov 19 launch:

1. **Load real background footage** — run one `ingest` (see
   [§3](#3-add-background-footage-master-clip--clip-pool)) so the render pool
   isn't empty.
2. **Run one real daily cycle** — `pnpm dev`, Fetch, approve 1–2, Render, and take
   the Telegram clip all the way to "Scheduled" on YouTube + Instagram. This is the
   first time ElevenLabs + Remotion run for keeps, so it's the real pre-launch check.
3. Tell me how it felt — anything clunky, I tune.

Everything below is the reference for that cycle and for every operator step after.

---

## 0. One-time setup (do once per machine)

1. Secrets live in env, never in code. In `apps/ideation/.env` set:
   - `TELEGRAM_BOT_TOKEN` — your bot's token from @BotFather.
   - `TELEGRAM_CHAT_ID` — the chat/channel the bot posts clips to.
   - `ELEVENLABS_API_KEY` — the **only** metered/paid API in the pipeline.
2. First-ever boot only (or after a schema change): `pnpm prisma:migrate`.
3. That's it — the apps boot even if a secret is missing (that feature just no-ops),
   so you can add Telegram later.

---

## 1. Start everything (one command)

```bash
pnpm dev
```

Starts Postgres + Redis, then all three apps together:

| App | URL | What it is |
|-----|-----|-----------|
| web (dashboard) | http://localhost:3000 | where you click |
| ideation API | http://localhost:3001 | the brain / queues |
| render worker | http://localhost:3002 | makes the videos |

Open **http://localhost:3000**. Leave the terminal running — it's your live log.

## 2. Shut everything down

In the `pnpm dev` terminal press **Ctrl-C** (answer **Y** to "Terminate batch
job"), then:

```bash
pnpm stop
```

Ctrl-C stops the three apps; `pnpm stop` stops the Postgres + Redis containers.

---

## 3. Add background footage ("master clip" → clip pool)

This is the footage that plays *behind* the voiceover — unrelated, cleared, muted
gameplay (e.g. Minecraft parkour). **No copyrighted footage of your subject, ever.**
You give it one long source video (the "master clip") and it slices a pool of short
vertical clips the renderer draws from at random.

**When:** whenever the pool is getting stale or empty. One good long source lasts
for many clips, so this is occasional, not daily.

```bash
pnpm --filter @shortsmith/render build
pnpm --filter @shortsmith/render ingest -- --file "C:\clips\mc-parkour.mp4" --source-url "https://youtu.be/xxxx" --game minecraft --clip-seconds 30
```

What each flag does:

- `--file` *(required)* — path to the long source video on your disk.
- `--source-url` — the original URL. **Recorded for provenance only** — we never
  download from YouTube. It gets license-checked and appended to
  `assets/backgrounds/LICENSES.md`.
- `--game` — folder to file the clips under (default `minecraft`).
- `--clip-seconds` — length of each sliced clip (default `30`).
- `--delete-source` — delete the big original after slicing (saves disk).

It center-crops landscape → 9:16, strips the audio, and writes the clips to
`assets/backgrounds/<game>/`. If you see **"⚠️ Standard YouTube License"**, only use
that footage if it's **your own capture** — otherwise pick a cleared source.

> **Clearance reminder** (see [operations.md](./operations.md)): background must be
> cleared or operator-owned, audio muted, zero copyrighted assets of your subject.
> The ingest handles the crop + mute; the clearance call is yours.

---

## 4. Get new scripts generated ("new clips")

The content itself — the hook/body/CTA script for each Short — is generated from
your whitelisted sources, not from the footage.

**On the dashboard → click "Fetch new scripts".**

That one button runs the whole pipeline: harvest → extract → rank → generate →
review. New, review-ready scripts land in the **Review** queue a short while later
(watch the `pnpm dev` log for progress).

Notes:
- **Volume is dynamic by design** — it generates only up to the number of *novel,
  confirmed* facts it found, one primary fact per script. A quiet news day = fewer
  scripts. That's intentional, not a bug.
- Nothing renders or spends any quota at this stage — it only drafts scripts for you
  to judge.

---

## 5. Review & approve (Gate 1) — the daily decision

Open the **Review** tab. Each draft shows its hook, body, CTA, and its
source-traceable claims (with tier) so you can judge rumor vs. confirmed.

How it works:

1. **Toggle each script Approve or Reject.** These are *staged* — nothing happens
   yet. You're just building today's shortlist.
2. You're capped at **2 approvals per day** (the `dailyClips` setting). The board
   shows remaining capacity.
3. When the shortlist is right, click **Render** to commit. **Only now** do the
   approved scripts get enqueued to render and start spending ElevenLabs quota.
4. **Untouched drafts roll over** — anything you didn't approve *or* reject stays in
   the queue for later. A script you explicitly **Reject** won't come back.

Idempotency guarantee: a script that already rendered (DONE) will **never**
re-render or re-spend quota, even if it's enqueued again. You can't accidentally
double-pay.

---

## 6. Publish each finished clip (Telegram → native scheduler → "Scheduled")

When a render finishes, the bot sends you, per clip, in your Telegram chat:

- the **video** file, captioned `🎬 Clip N · <date>`
- the **thumbnail**, captioned `🖼️ Thumbnail for Clip N · <date>`
- each copyable field in its **own bubble** — a label bubble then a value bubble —
  for YouTube **title**, **description**, **tags**, and the Instagram **caption**
- the **slot time** shown in US (ET) / UK / your IST.

Your job, in a comfortable IST evening batch:

1. Download the video + thumbnail from Telegram.
2. In **YouTube Studio** and **Instagram**, upload the clip + thumbnail, paste the
   title/description/tags/caption from the bubbles.
3. Set each platform's **own native scheduler** to the **slot time** shown. The
   platforms post it overnight while you sleep — you don't stay up for the US slot.
4. Run the per-clip clearance checklist (not-for-kids, AI/synthetic disclosure,
   fan-channel disclaimer, cleared music — see [operations.md](./operations.md)).
5. Reply **`Scheduled`** to the bot (the clip's message). That one word marks the
   clip done. ("scheduled" in any casing works; it must be that word.)

### If a render is bad

Use the buttons on the **Publish** board:

- **Redo** — re-render the *same* script. Reuses the cached voiceover, so **no new
  ElevenLabs charge**. Use this for a visual glitch.
- **Reject clip** — drop this clip and **free its slot**, then pick a different
  script from the still-intact draft pool (back at [§5](#5-review--approve-gate-1--the-daily-decision)).
  Use this when the script itself isn't working.

---

## 7. The notifications you'll get (and when)

All times are in your IST (the `operatorTimezone` setting).

- **New-day briefing** — at `briefingTime` (default **09:00**): "🌅 New day — N of X
  clips scheduled for <date>." Your fresh-slate nudge to Fetch + Render.
- **Evening reminder** — from `reminderTime` (default **21:00**), hourly while any
  clip is still unscheduled: nudges you to finish the batch before the slots pass.
- **Day complete + streak** — once all the day's clips are scheduled: "✅ All X clips
  scheduled… 🔥 N-day streak." Streak = consecutive IST days you scheduled everything.

---

## 8. Change the schedule (slots, how many per day, timezone)

The cadence is **per-channel config** now — change it in the dashboard, not in
code. Open **Setup → Posting schedule** and edit, then **Save**:

| Field | What it controls | Default |
|-------|------------------|---------|
| **Post times** | daily posting times (`"HH:mm"` in the audience timezone); clips fill them in order | `12:00, 19:00` |
| **Posts per day** | the daily cap — max clips published per day | `2` |
| **Audience timezone** | the market the post times are in | `America/New_York` |
| **Your timezone** | your zone — drives the briefing/reminder timing + streak | `UTC` |

Common changes:
- **Post 3/day instead of 2:** set Posts per day to `3` and add a third post time.
- **Different slot times:** edit the Post times list.

> The briefing/reminder times and allowed post-days live on the channel's
> `publishConfig`; the neutral fallback in
> `apps/ideation/src/config/publishing.ts` only applies until the wizard sets them.

> Tip from [operations.md](./operations.md): treat slot times as a starting guess
> and move them to your channel's real peak-viewer times after ~a week of analytics.

---

## Quick reference

| I want to… | Do this |
|------------|---------|
| Start everything | `pnpm dev` → http://localhost:3000 |
| Stop everything | Ctrl-C (Y), then `pnpm stop` |
| Add background footage | `pnpm --filter @shortsmith/render ingest -- --file "..." --game minecraft` |
| Get new scripts | Dashboard → **Fetch new scripts** |
| Choose today's clips | **Review** tab → toggle Approve/Reject → **Render** |
| Publish a finished clip | Telegram → upload + native-schedule → reply `Scheduled` |
| Fix a bad render | **Publish** tab → **Redo** (same script, free) or **Reject clip** |
| Change slots / count | **Setup → Posting schedule** → edit → Save |
