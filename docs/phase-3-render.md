# Phase 3 — Rendering: brainstorming & decisions (IN PROGRESS)

> **Status: brainstorming, NOT locked, DO NOT BUILD YET.** This captures the
> Phase 3 requirements as we nail them down. Once settled, the locked items here
> graduate into ADRs (ADR-021+) in [decisions.md](./decisions.md) and the
> deviations below get reconciled into [shorts-spec.md](./shorts-spec.md).
> Last updated: 2026-11-03.

Phase 3 turns an **APPROVED** `Script` (the `ScriptExport` contract in
`packages/shared`) into a finished, watchable vertical video the operator would
actually post. Local-only, human-in-the-loop, cost-conscious.

---

## 1. Decided (confirmed by operator)

### Integration & triggering
- **Standalone service** in `apps/render` — its own process, not a module inside
  `apps/ideation`. (Q1)
- **Auto-enqueue** a render the moment a `Script` hits `APPROVED`, **with an
  operator option to cancel** a queued/running render. (Q2)
- On success, the finished video **feeds directly into the Phase 4 upload queue**
  (Phase 4 not built yet — for now the render completes and is marked ready). (Q4)
- **Local-only on the operator's machine** for now (ADR-016). (Q5)

### Engine & infra
- **Remotion**, provided its license is free for our use. ⚠️ *Verify Remotion
  licensing* — free for individuals / very small teams; paid company license above
  a size/revenue threshold. Solo operator = expected free; confirm before
  committing. (Q6)
- **Remotion Studio** (live preview) wired up during development. (Q8)
- Throughput target **2–3 clips/day** → render **serially, concurrency 1, no GPU
  reliance**. (Q7, Q9)
- **Operator machine:** Ryzen 7, 16 GB RAM, AMD Radeon, older laptop, **limited
  disk**. Implications: Remotion renders are **CPU-bound** (headless Chromium);
  the AMD GPU helps little. 16 GB RAM is fine at concurrency 1. **Disk is the real
  constraint** — keep the footage/music library lean, auto-clean old outputs,
  mind that Remotion + Chromium + node_modules are heavy. Expect ~a few minutes
  per 30 s clip. (Q7)

### Voiceover (ElevenLabs)
- **One fixed channel voice**, id `WZlYpi1yf6zJhNWXih74`. (Q10/11)
- Model → `eleven_turbo_v2_5` (natural, cheap tier). (Q12)
- **Word-timed captions from ElevenLabs' `/with-timestamps` endpoint** — no
  separate forced-aligner. (Q13)
- Synthesize the **whole script in one request** (hook/body/CTA joined by
  newlines) → **one seamless audio piece** with natural pauses; sections recovered
  from word timings. (Separate-segment stitching left an audible ambient "cut" at
  each join — fixed.) (Q14)
- **Actual audio length overrides `estDurationSec`.** (Q16)
- **Cache audio keyed to script version** — unchanged scripts don't re-voice. (Q17)
- **API key** is in the env as `ELEVENLABS_API_KEY` (read from env, never logged). (Q50)

### Layout — full-screen gameplay + overlaid captions (re-aligned with shorts-spec)
- **Gameplay fills the entire 1080×1920 frame as the background; captions overlay
  on top.** (Supersedes the earlier top/bottom split idea.) (Q20 revised)
- **Gameplay plays continuously** (that steadiness *is* the retention mechanic);
  the **word-by-word caption pops provide the rhythm**. We **drop the forced
  "hard cut/zoom every 2–3 s"** — forcing cuts would hurt retention. Optional
  subtle slow punch-in can be added later if it reads flat. (Q32 resolved)

### Captions (Hormozi-style, brand-adapted)
- **One word at a time**, **UPPERCASE**, centered lower-third, with a small
  pop/scale as each word appears. (Q18/Q21)
- Reference = the attached screenshot (white fill + heavy black stroke; spoken
  word highlighted). **Brand adaptation:** active/spoken word highlighted in
  **brand magenta** (≈ `#FF1E9C`, exact value TBD from source art) instead of the
  reference's green. (Q19/Q53)
- Default font: a heavy free uppercase face (candidates: **Anton**, **Montserrat
  Black**, or a "The Bold Font"-style rounded heavy) — operator can swap. (Q19)

### Thumbnail — Remotion-composed still (not AI)
- Compose a thumbnail in Remotion: a **dynamic, high-contrast gameplay frame** +
  **`thumbnailText`** in the bold brand caption style (+ optional logo badge).
  Rationale below. Keep a seam to swap in AI later if data ever justifies it. (Q36/37)

### Background gameplay — sourcing & clearance (see §4 for the full analysis)
- Clips **already vertical (9:16)**, live in a **local folder**, **random
  selection per clip**, **muted**; longer-than-VO → random start offset + trim,
  shorter → loop. (Q22–27)
- **Game choice is constrained by clearance (ADR-002).** Recommended primary =
  **Minecraft** (publisher permits monetized gameplay video; it's literally the
  ADR-002 example) using **footage we capture ourselves or a verified
  CC0/royalty-free pack**. **the subject V footage is NOT recommended** (see §4).

### Music
- **Local pool** of mood-tagged tracks (YouTube Audio Library has no API →
  one-time manual download). Selected **randomly by the `musicMood` field**, sits
  **low under the voice**. Setup instructions handed to operator. (Q28/29/31)

### Scope & done
- **Prefer the full spec**, iterative delivery fine, **report progress + next
  steps continuously**. (Q46)
- **Test against APPROVED scripts already in the DB** — don't generate new. (Q47)
- **Done = a watchable clip the operator would actually post.** (Q49)

### Cost
- ElevenLabs **Starter (~$5/mo, commercial license)**; Turbo v2.5 + caching keeps
  2–3/day well inside the monthly credits. **ElevenLabs is the only paid service.** (Q43/45)
  - ⚠️ **Confirmed gotcha:** the ElevenLabs **Free tier cannot synthesize via the
    API** — returns `402 paid_plan_required` ("Free users cannot use library
    voices via the API") for any voice. The Starter upgrade is a hard prerequisite
    before any render produces voiceover. The TTS integration itself is verified
    (auth + request/response handling correct); only the plan gate blocks audio.

---

## 2. Default decisions (operator deferred to me)

- **Status write-back:** new Prisma **`RenderJob`** model (status
  QUEUED/RENDERING/DONE/FAILED/CANCELLED, video path, thumbnail path, real
  duration, assets used, error, timestamps); ideation DB stays source of truth.
- **Architecture:** `apps/render` is a **BullMQ worker on the shared Redis**,
  consuming a new `render` queue. Approve enqueues `{scriptId}`; the worker
  fetches the **`ScriptExport`** via the review API, renders, writes outputs
  locally, POSTs status back. Cancel = cancel the job + set `CANCELLED`.
- **One output file serves both platforms** (both 1080×1920 9:16; per-platform
  difference is metadata handled at publish). No double render.
- **Persist for the ADR-020 loop:** real duration, audio duration, voice id,
  background clip(s), music track, output paths, render time.
- **Per-series render config** (voice, background pool, music pool, caption style)
  in **config files per series** (like `config/sources.ts`) — keeps ADR-006.
- **Manual VO fallback** seam now (mirrors ADR-013), build later.
- **TTS provider interface** (like `packages/llm`) so ElevenLabs/manual/other swap
  without touching the renderer.
- **Naming:** `{seriesKey}-{scriptId}.mp4` + `{seriesKey}-{scriptId}.thumb.png`.

### Thumbnail rationale (Remotion-composed, not AI)
- For **Shorts/Reels, the thumbnail's role is smaller than long-form** — in-feed
  autoplay shows the *video*, not a thumbnail. The thumbnail mainly matters in the
  channel grid, search, and related. The real "swipe-stopper" is the **first
  1–2 s / hook frame**, so polish goes there.
- **AI thumbnails** add cost, inconsistency, and off-brand/uncanny risk for a
  faceless gaming channel, and rarely beat a clean bold-text-on-frame.
- **Remotion-composed** is free, consistent, on-brand, and editable — a dynamic
  gameplay frame + big magenta/white brand text is exactly what strong faceless
  channels ship. (Aligns with the "judge by best practice, not taste" lens.)

---

## 3. Deviations from shorts-spec (to reconcile later)

- **Watermark:** operator wants **no watermark in the video** (shorts-spec has a
  corner watermark). → update shorts-spec.
- Captions position/animation now specified (Hormozi-style word-by-word).
- Forced "cut/zoom every 2–3 s" **dropped** in favor of continuous gameplay.
- (Layout is back to overlay full-frame, which *matches* shorts-spec — no change.)

---

## 4. Game footage clearance — findings (operator asked me to research)

**"Cleared" has TWO independent layers; both must hold:**
1. **Publisher policy** — does the game's owner permit *monetized/commercial*
   video of their game?
2. **Footage rights** — do we actually own the specific clip (we captured it) or
   is it under a real CC0/royalty-free license we can evidence? **"Downloadable"
   ≠ "licensed."** Ripping another creator's video infringes *their* copyright
   regardless of the game's own policy.

**the subject V (the attached stunt clip) — NOT recommended, on three grounds:**
- **Publisher policy:** the rights-holder/the rights-holder permits fan footage for
  **non-commercial** use only; a monetized ad channel is commercial → **outside
  the policy**. Commercial/ad work "likely does not apply" and would need a
  separate license (contact `copyright@take2games.com`).
- **Footage rights:** that mega-ramp clip is almost certainly **another creator's
  recording** — reusing it infringes their copyright independent of the rights-holder.
- **ADR-002 intent:** our rule is *unrelated* background gameplay so there's no
  association with the subject. the subject-on-a-the subject-channel defeats that and muddies the brand.

**Minecraft — recommended primary:**
- Mojang/Microsoft **explicitly allow creating and monetizing Minecraft gameplay
  videos** (the promo/brand-advertising carve-out is a different case; a content
  channel monetized via YouTube ads is the permitted one). It's the ADR-002
  example.
- Still must use **our own captured footage or a verified CC0/royalty-free pack**,
  muted — not a ripped video. Keep the license on file.

**"Satisfying rings" style — two routes (operator identified the game):**
- **Ring Escape / Bouncing Ball Rings mobile game** (`com.relevantwine.satisfyingcirclesdeluxe`):
  **no findable creator/content policy** → screen-recording it for a monetized
  channel is legally gray, plus we'd be making footage of someone else's app IP.
  **Not recommended.**
- **bbounce.app — RECOMMENDED for this style.** It's a purpose-built generator
  that turns physics sims (incl. "Ring Escape") into **9:16 1080×1920 MP4s made
  for Shorts/Reels/TikTok.** Its Terms **§6: "You own the videos you generate"** —
  no commercial restriction, no attribution required on the generated video. So we
  **own, licensed, ready-to-use** footage. Caveats: (a) the free tier watermarks
  exports, so watermark-free needs a paid plan (**Smart €4.99/mo = 40 videos/mo**,
  plenty); (b) don't use their CC BY 3.0 game-icons or import third-party media
  into a scene. This is a **second small subscription** to weigh against the
  "ElevenLabs only" preference.

**Operator action + recommendation:**
- Safest path: **operator captures their own Minecraft parkour** (or uses a pack
  with an explicit CC0/royalty-free license we save), muted, into the local
  folder. Maintain a **per-clip clearance manifest** (ties to the per-clip
  clearance checklist in [operations.md](./operations.md)).
- *Note: this is orientation, not legal advice; for a commercial channel a lawyer
  is the right call on edge cases.*

---

## 5. Local asset setup — instructions for the operator

Exact folder paths firm up at build; the shape:

### Background footage
```
assets/
  backgrounds/
    minecraft/           # muted, vertical (9:16) clips you captured or CC0-licensed
      clip-01.mp4
      clip-02.mp4
    <other-cleared-game>/
    LICENSES.md          # per-clip: source, license, date — the clearance manifest
```
- Only **cleared + muted + vertical** clips. We strip audio on render anyway, but
  capture muted to be safe.

### Music pool (one-time manual download; no API)
```
assets/
  music/
    upbeat/              # match the publish package's musicMood values
    tense/
    chill/
    LICENSES.md          # track, source, license, attribution-required? (y/n)
```
- Good sources with clear terms: **YouTube Audio Library** (download from Studio),
  **Pixabay Music** (no-attribution), **Uppbeat** (free tier, attribution). Save
  each track's license/attribution in `LICENSES.md`. ~5–10 tracks per mood is
  plenty to start; renderer picks randomly within the matched mood.

### Fonts (for captions)
```
assets/
  fonts/                 # the chosen heavy uppercase font file(s), .ttf/.otf
```

> Operator: once you pick/capture footage and download music, drop them into
> these folders and fill the two `LICENSES.md` files. I'll finalize exact paths
> and wire selection when we build.

---

## 7. Footage ingestion pipeline (operator request)

Operator's source clips are **long (7–8 min) landscape** videos. Rather than
hand-prep each one, an **ingest command** does it automatically.

**Ingest = one command** (`pnpm render:ingest <file | youtube-url>`):
1. Acquire the source (local file; or YouTube via yt-dlp — see caveat).
2. **Crop landscape → 9:16** (center-crop), **strip audio**, normalize to
   1080×1920 30fps.
3. **Slice into N-second clips** (e.g. 25–40 s) → write to
   `assets/backgrounds/minecraft/`.
4. Record provenance in `LICENSES.md` (source, license, date).
5. Optionally **delete the big source** after slicing (disk-friendly — matters on
   the limited-disk laptop).

Render then picks a **random clip** from the pool (as already decided). Many
small vertical clips from one long source = lots of variety for free.

> **Alternative considered:** keep long sources and random-offset at render.
> Rejected for the limited-disk machine — pre-sliced vertical clips are smaller
> and let us delete the source. If disk ever gets tight, prune old clips.

### Sourcing — DECIDED: file-drop + YouTube link as provenance only
- **Footage comes in as a muted landscape file** the operator drops in (operator
  obtains it by legitimate means). We **never download from YouTube**, so there is
  no YouTube-ToS issue.
- **The operator also passes the YouTube URL alongside the file — purely as
  provenance.** Ingest **reads that link's license metadata** (is it actually
  marked Creative Commons / reuse-allowed?) and records it in `LICENSES.md`.
  Reading a page's license ≠ downloading the video, so terms stay fine, and we get
  a per-clip verification check (operator verifies too).
- So ingest accepts: `--file <muted.mp4> --source-url <youtube-url>`; the URL is
  logged + license-checked, the file is what we crop/slice.

## 6. Status of remaining items

**Closed:**
- **Footage source — Minecraft only.** Operator has copyright-free footage in
  **landscape**; **the render pipeline auto-crops landscape → 9:16 (center-crop)**,
  so no manual conversion needed. bbounce.app shelved (free tier watermarks the
  footage; paid is a second sub — revisit later if we want the rings style).
- **Remotion license — free for us.** Free License covers individuals / orgs up
  to 3 people, commercial use included, no signup. Solo operator = free. (The
  paid Automators tier is only for 4+ person companies building video products.)
- **Brand magenta hex** — I'll sample it directly from `brand/` artwork at build;
  no operator action.
- **Fonts** — I'll bundle a free heavy uppercase font (e.g. Anton); operator can
  swap for a brand font later.

**Needed from operator (for end-to-end testing, not to start building):**
- Drop a couple of the **copyright-free Minecraft clips** (landscape fine) into
  `assets/backgrounds/minecraft/` once I scaffold it, + a line each in
  `LICENSES.md`.
- Confirm the **stack can run** (Docker Postgres + Redis) and there are
  **APPROVED scripts in the DB** to render against (or we run the ideation
  pipeline to produce one).
- **Music** can come in a later iteration — we render without a music bed first,
  add the mood-tagged pool after the core video works.
