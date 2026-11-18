# Roadmap

The sequencing is deliberate: build the **ideation engine** first, learn what
hits by posting **manually**, then automate **rendering** and **publishing**.
This keeps cost near zero and de-risks the expensive halves until the content
is proven.

## Phase 1 — Ideation engine (NOW — this repo)

Build web-sources → review-ready scripts.

- [x] Monorepo scaffold, docs, Prisma data model, empty-but-coherent stubs.
- [x] LLM provider layer — Gemini free-tier fallback queue + manual paste mode
      (ADR-012/013).
- [x] `harvest` — tiered whitelist + open web (ADR-014) (`config/sources.ts`).
- [x] `extract` — LLM atomic claim extraction with source metadata.
- [x] `rank` — confidence + corroboration clustering into FactUnits.
- [x] `generate` — angle + grounded script, dynamic volume, novelty check.
- [x] `review` API — queue / approve / edit / reject (Gate 1 backend).

**Exit:** scripts are being generated and sit in a review queue. ✅ **Done.**

## Phase 2 — Manual posting + metrics (learn what hits)

No new rendering automation yet.

- [x] Build the Next.js review dashboard (`apps/web`) for Gate 1.
- [ ] Operator **manually** produces & posts a handful of clips/day from
      approved scripts (voiceover + captions over cleared muted background),
      using the **native schedulers** (YouTube Studio + Meta Business Suite) for
      fixed-slot publishing — no custom poster yet.
- [x] Capture early performance signal (which hooks / angles / facts land) —
      `Post` metrics + the dashboard's Performance screen (ADR-020).
- [x] Feed learnings back into hook scoring and angle selection — gated
      performance feedback into `generate` (ADR-020).

**Exit:** a validated sense of what formats/hooks perform before investing in
render automation.

## Phase 3 — Rendering (NOW)

Approved script → finished vertical video. Design & decisions locked in
[phase-3-render.md](./phase-3-render.md) (ADR-021..025).

- [x] `apps/render` — Remotion pipeline.
- [x] Muted cleared background (e.g. Minecraft parkour) — see ADR-002.
- [x] ElevenLabs voiceover.
- [x] Word-timed captions.
- [ ] YouTube Audio Library music bed. *(deferred — renders without a bed for now;
      the mood-tagged pool comes in a later iteration.)*
- [x] Consumes the **export contract** (APPROVED Script) — see
      [architecture.md](./architecture.md#export-contract).

**Exit:** approved scripts render to finished vertical videos automatically.
✅ **Met (2026-11-06)** — verified end-to-end live: approving a script auto-enqueues a
render that produces a finished 1080×1920 clip + thumbnail and reports `DONE` back to
the ideation DB. See the e2e note in [content-strategy.md](./content-strategy.md).

## Phase 4 — Publishing (NOW)

Finished video → YouTube / Reels, behind **Human Gate 2**. For launch this is
**notification-assisted manual posting via the platforms' native schedulers**,
not an automated API poster (ADR-030). Design:
[phase-4-publish.md](./phase-4-publish.md).

- [ ] **Staged Gate-1 review:** approve/reject are *pending* choices committed by
      one **Render** button; approvals capped at the daily clip count (ADR-031).
- [ ] **Publish queue (FIFO) + slots:** a `DONE` render becomes a `PublishTask`
      assigned the next open fixed daily slot (ADR-032).
- [ ] **Telegram notifier:** pushes the clip + thumbnail + copy-paste YouTube/IG
      metadata + slot time; operator schedules it natively (ADR-033).
- [ ] **Gate 2 + `Scheduled` reply:** operator replies `Scheduled` (or marks it in
      the dashboard) to confirm; creates the `Post` rows; reminders + catch-up.
- [ ] **Redo / Reject** on any rendered clip; idempotent render so nothing
      re-renders or re-spends quota (ADR-034).

**Exit:** approved clips reach the operator on Telegram with everything needed
and get scheduled to both platforms after a human spot-check, on a FIFO slot
schedule.

## Phase 5 — Automated API poster (deferred)

Replace the manual schedule-and-confirm step with direct API posting on the
**same** PublishTask queue + Gate 2 (ADR-030, §6 of phase-4-publish.md):

- [ ] YouTube Data API v3 upload (OAuth; ~6 uploads/day on default 10k quota).
- [ ] Instagram Graph API Content Publishing (Business account + Facebook Page +
      Meta app + App Review + public video URL).

**Revisit when:** the daily manual batch becomes the bottleneck, or Meta App
Review clears.

## Guardrails that persist across all phases

- Two human gates; nothing auto-publishes (ADR-004).
- No the subject footage; cleared muted backgrounds only (ADR-002).
- Grounded, source-traceable claims only (ADR-005).
- Series/niche stays configuration-driven (ADR-006).
