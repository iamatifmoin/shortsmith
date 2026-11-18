# Phase 4 — Publishing: design & decisions (IN PROGRESS)

> **Status: design settled with the operator, build starting (2026-11-07).**
> Locked items here graduate into ADRs (ADR-030+) in
> [decisions.md](./decisions.md). This supersedes the earlier "automated API
> poster" sketch in the roadmap; that path is **deferred to Phase 5** (§6).

Phase 4 turns a **finished render** (a `RenderJob` at `DONE`) into a **posted
clip** on YouTube Shorts + Instagram Reels — behind **Human Gate 2**. The big
decision: for launch we do **notification-assisted manual publishing**, not an
automated API poster. The operator keeps full control, we add zero API/approval
lead time, and the only new cost is free.

---

## 1. Why manual-assisted, not the API poster

The automated-poster path (YouTube Data API v3 + Instagram Graph API) carries
hard, slow prerequisites that don't fit a 12-day launch runway:

- **YouTube:** a Google Cloud project + OAuth consent screen. (The old
  "unverified projects upload private" lock was **removed 2 Nov 2026**, so public
  uploads are at least possible — but the OAuth setup is still real.)
- **Instagram:** the Content Publishing API needs a **Business account linked to
  a Facebook Page**, a **Meta app**, a long-lived token, the video served from a
  **public URL** (no binary upload), and usually **Meta App Review** (days to
  weeks) for the publish permission.

This is exactly the manual-phase shortcut the roadmap always named: **post via
the platforms' own native schedulers**. It preserves both human gates (ADR-004)
and costs nothing. The automated poster becomes **Phase 5**, buildable later on
the same queue without rework.

### The timezone insight that makes manual viable
Operator is in **IST**; the priority market is **US** (secondary UK). US-prime
Shorts slots (noon / 3pm / 7pm ET) land at **~10:30pm / 1:30am / 5:30am IST** —
the middle of the operator's night. So "manual" does **not** mean posting live at
the slot. It means: **upload at a comfortable IST hour and use each platform's
native scheduler to set the public go-live time.** Both platforms support this:
- **YouTube Studio:** upload → Visibility → **Schedule** → pick date/time.
- **Instagram:** native in-app scheduling for Reels on a **Professional**
  account (up to 75 days / 25 posts/day). Only a free Professional toggle is
  needed — **no** Facebook Page, Meta app, or App Review for the native path.

So the operator does **one relaxed daily batch** (e.g. 9–11pm IST), scheduling
2–3 clips to publish overnight.

---

## 2. The daily loop (end to end)

1. **Fetch** — operator clicks **Fetch new scripts** in the dashboard; it
   triggers the existing pipeline (`POST /harvest/run`) → new DRAFT scripts in
   the Gate-1 queue. *(Existing.)*
2. **Stage (Gate 1)** — operator walks the drafts and marks each **approve /
   reject** as a **pending** choice. **Nothing renders and nothing disappears
   yet.** Approvals are **capped at the daily clip count** (default **2**,
   configurable). Un-touched drafts stay in the pool (roll over).
3. **Commit (Render)** — operator clicks **Render**. Only then:
   approved → render, rejected → `REJECTED`, untouched → stay `DRAFT`.
4. **Render** — each committed script renders to a finished clip + thumbnail.
   *(Existing Phase-3 pipeline.)* On `DONE`, a **PublishTask** is created and
   assigned the next open **slot**.
5. **Notify (Telegram)** — the moment a clip is `DONE`, a Telegram message is
   pushed with: the **video file**, the **thumbnail**, the **assigned slot**
   (shown in ET / UK / IST), and **copy-paste blocks** — a YouTube block (title,
   description, tags, settings checklist) and an Instagram block (caption).
6. **Gate 2 / publish (operator, daily batch)** — operator uploads each clip in
   YouTube Studio and the Instagram app, pastes the blocks, and **schedules** it
   for its slot. Gate 2 *is* this step: the veto is simply not scheduling it (or
   using Redo / Reject — §4).
7. **Confirm** — operator **replies `Scheduled`** to that clip's Telegram message
   (case-insensitive). The task is marked `SCHEDULED`, the `Post` rows (one per
   platform) are created for the ADR-020 metrics loop, and the queue advances.
   Confirming can also be done from the dashboard.
8. **Remind** — if a `DONE` clip is still unscheduled near/after its slot, a
   Telegram reminder nudges the operator. Reminders **catch up on startup** if
   the app was off when one came due.
9. **Learn** — next day the operator enters view/retention numbers on the
   existing Performance screen; they feed hook/angle scoring (ADR-020).

**Automated:** fetch, generate, render, slot assignment, notify, remind, Post-row
creation, queue bookkeeping, idempotency/quota guards.
**Operator:** approve/reject (Gate 1), the upload-and-schedule tap per app
(Gate 2), the `Scheduled` reply, entering metrics.

---

## 3. Staged review + commit + daily cap (changes ADR-021 trigger)

- **Staging is non-destructive.** A new nullable `Script.reviewSelection`
  (`APPROVE` | `REJECT`) records the pending choice **without** changing
  `status`. The **Render** (commit) action transitions all pending selections at
  once: `APPROVE` → `APPROVED` + enqueue render; `REJECT` → `REJECTED`; `null` →
  unchanged `DRAFT`.
- **ADR-021 is preserved at the data layer:** `APPROVED` still triggers a render.
  We only moved *when* the approve transition fires — from per-click to the
  batched Render commit. (Recorded as a deviation; ADR-031.)
- **Daily cap.** The commit allows new approvals only up to the series'
  `dailyClips` minus the clips **already active for the day** (rendered-and-
  awaiting-schedule + in-flight renders). Rejecting a rendered clip frees a slot
  and re-opens capacity (§4). The dashboard enforces the cap live; the API
  re-checks it on commit.

---

## 4. "Bad render" remedies — no wasted quota

Two buttons on any `DONE` clip in the dashboard:

- **Redo** — re-render the **same script** (forces a new `RenderJob` despite an
  existing `DONE`). The render worker **reuses the cached voiceover** (audio is
  cached by script version, Phase 3), so Redo re-composes video with a different
  background and makes **zero** new paid (ElevenLabs) calls unless the script
  text changed. Use when the script is good but the take isn't.
- **Reject clip** — drop this clip (PublishTask → `CANCELLED`, Script →
  `REJECTED`), **freeing its slot**. The operator approves a replacement from the
  still-intact draft pool and commits — only the new script renders.

**Idempotency / quota (ADR-034).** `render.enqueue` already returns the existing
job if one is in flight; it is extended to also **skip a script that already has
a `DONE` render** unless `force` (Redo) is set, and BullMQ `jobId` keeps one job
per attempt. Net: clicking Render only renders genuinely-new scripts; a happy
clip is never re-rendered. **ElevenLabs is the only metered API** in the flow
(Gemini runs only on Fetch; Telegram is free), and the version-keyed audio cache
protects it across takes.

---

## 5. Data model & services

### Prisma (mirror in `packages/shared`)
- `enum ReviewSelection { APPROVE REJECT }` + `Script.reviewSelection ReviewSelection?`.
- `enum PublishStatus { READY NOTIFIED SCHEDULED CANCELLED }`.
- `model PublishTask` — one per clip heading for a slot:
  `id, scriptId, renderJobId, status, slotAt DateTime, notifiedAt?,
  scheduledAt?, telegramChatId?, telegramMessageId?, createdAt`. Indexed on
  `status` and `slotAt`.
- `model AppState { key String @id, value String, updatedAt }` — tiny KV for the
  Telegram `getUpdates` offset (so replies aren't reprocessed).
- `Post` is unchanged (ADR-020 metrics snapshot); PublishTask `SCHEDULED` creates
  the two `Post` rows. `Post.externalUrl` stays **optional** (operator may paste
  the live link later in the dashboard; not required).

### Disk cleanup (local-only, ADR-032)
When a clip is **SCHEDULED** (operator has it from Telegram and it's scheduled on
both platforms) or dropped via **Reject/Redo**, its finished `.mp4` + thumbnail
are deleted from disk and the RenderJob's file paths nulled — the limited-disk
machine never hoards clips. The RenderJob row stays for the ADR-020 loop, and the
**voiceover cache is left intact** so a later Redo stays free (ADR-034).

### Running it — one command
`pnpm dev` (root) brings up Postgres + Redis (`db:up`) then runs the ideation API,
the render worker, and the web dashboard together via `concurrently` (Ctrl-C
stops all). Individual `pnpm ideation:dev` / `render:dev` still work.

### Modules (`apps/ideation/src/modules`)
- **`publish`** — owns PublishTask lifecycle, slot assignment (next open slot,
  FIFO by render-finish), the Gate-2 list API, and disk cleanup. A timer sweep
  creates PublishTasks for `DONE` renders (a DB sweep, not a render callback — no
  circular dependency with render).
- **`telegram`** — provider-style service. **Outbound:** `sendVideo` with caption
  + copy-paste blocks. **Inbound:** a `@nestjs/schedule` poller calling
  `getUpdates` (offset from `AppState`), matching replies to a known
  `telegramMessageId`, acting on the `Scheduled` keyword. **Reminders +
  catch-up:** a scheduled sweep over due/overdue unscheduled tasks.
- **Copy-paste blocks** built from `PublishPackage` (YT: `title` /
  `description` + `hashtags` + standing disclaimer / `tags`; IG: `igCaption`) +
  the slot time rendered in ET / UK / IST.

### Config (per series, ADR-006)
`config/publishing.ts` — per series: `timezone` (e.g. `America/New_York`),
`slots` (e.g. `["12:00","15:00","19:00"]`), `dailyClips` (2), `postDays` (all 7).
**Secrets in env only:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (never logged,
mirrors `ELEVENLABS_API_KEY`).

---

## 6. Deferred to Phase 5 — automated API poster

Kept out of scope deliberately; the queue is shaped to adopt it later with no
rework. Phase 5 would add, behind the **same PublishTask queue + Gate 2**:
- YouTube Data API v3 upload (OAuth; ~6 uploads/day on the default 10k quota).
- Instagram Graph API Content Publishing (Business account + Facebook Page +
  Meta app + App Review + a public video URL, e.g. a short-lived object-store
  link).
Trigger to revisit: the daily manual batch becomes the bottleneck, or App Review
clears.

---

## 7. Operator setup (independent of the build — can start now)

1. **Telegram bot (≈2 min):** in Telegram, message **@BotFather** → `/newbot` →
   name it → copy the **bot token** into `apps/ideation/.env` as
   `TELEGRAM_BOT_TOKEN`. Then **message your new bot once** (say "hi") so the app
   can capture your **chat id** on its first poll (no need to set it by hand).
   Start everything with `pnpm dev`.
2. **Instagram → Professional (≈1 min):** IG app → Settings → *Account type and
   tools* → **Switch to Professional** (Creator is fine). No Facebook Page
   needed for native scheduling. This unlocks in-app Reel scheduling.
3. **YouTube:** channel **the channel** already exists — nothing to do; we use
   Studio's native Schedule.
4. **Nothing else** — no Google Cloud, no Meta app, no API keys beyond the
   existing ElevenLabs/Gemini ones.

---

## 8. Open defaults (operator deferred to me — locked as below)
- One `Scheduled` reply marks the clip done on **both** platforms for that day.
- `Post.externalUrl` optional; metrics entered later drive the loop, not the URL.
- Untouched drafts roll over as a backlog buffer (smooths slow-news days).
- Slots default `12:00 / 15:00 / 19:00 America/New_York`, `dailyClips: 2`, 7 days.
- YouTube: Gaming category, **not** made for kids, `#Shorts` + hashtags in the
  description, a standing "not affiliated with the rights-holder" disclaimer + the
  primary source link. IG: hashtag caption from `igCaption`.
