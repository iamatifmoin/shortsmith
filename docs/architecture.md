# Architecture

## Monorepo layout

```
shortsmith/
  apps/
    ideation/   NestJS + BullMQ + Prisma — the ideation pipeline (THIS phase)
    web/        Next.js review dashboard  — README placeholder (later)
    render/     Remotion render pipeline  — README placeholder (later)
  packages/
    shared/     Export-contract types + enums (framework-free)
    llm/        Provider-agnostic LLM interface + Anthropic stub
  docs/         product / decisions / architecture / sources /
                operations / shorts-spec / roadmap
  docker-compose.yml   Postgres 16 + Redis 7 for local dev
```

Workspaces: `apps/*`, `packages/*` (pnpm). Packages are published internally as
`@shortsmith/shared`, `@shortsmith/llm`, `@shortsmith/ideation` and linked via
`workspace:*`.

## The ideation pipeline

Stages are **BullMQ jobs over Redis**. A row walks the pipeline via a status
field (`AngleStatus` on `Angle`, `ScriptStatus` on `Script`). Each stage is a
NestJS module with a **service** (business logic) and a **processor** (the
BullMQ worker that calls the service).

```
 harvest ──▶ extract ──▶ rank ──▶ generate ──▶ review (Human Gate 1)
   │            │          │          │              │
 Fetch       Atomic     Confidence  Angle +       Dashboard:
 tiered      claims +   + cluster   Script        approve /
 whitelist   source     into        grounded on   edit /
 (not open   metadata   FactUnits   linked facts  reject
  web)                                             (reject may
                                                    flag FactUnit)
```

### 1) harvest
Scrape a **tiered source whitelist** (`apps/ideation/src/config/sources.ts`),
**not** the open web. Tiers:
- **Tier 1** (canonical/confirmed): the subject's own first-party channels —
  official site, newsroom/newswire, investor releases, official YouTube.
- **Tier 2** (reputable press): established outlets and trade press that cover
  your niche.
- **Tier 3** (community/aggregators, **RUMOR-flagged only**): subreddits, forums,
  and fan aggregators for the niche.
- **Tier 4** (open web via search, **RUMOR-flagged only**, operator-judged):
  beyond the whitelist, lowest trust, never auto-trusted (ADR-014).

Output: raw fetched pages (text + URL) handed to `extract`.

### 2) extract
An LLM pulls **atomic factual claims** from each fetched page. For each claim,
store: `claim`, `sourceUrl`, exact `snippet`, `sourceTier`. Persisted as `Fact`
rows (one raw sourced claim each).

### 3) rank
Compute confidence from source tier + corroboration count, and **cluster
near-duplicate claims into one `FactUnit`**.

Confidence rule (see [sources.md](./sources.md)):
- `CONFIRMED` = any Tier-1 source **OR** ≥2 independent Tier-2 sources.
- `STRONG_RUMOR` = 1 Tier-2 source.
- `RUMOR` = Tier-3 only.

`FactUnit.corroborationCount` = number of independent facts clustered into it.

### 4) generate
Internally form an **angle** (no angle gate), then write a full **script**
grounded **only** on the linked fact(s).
- **One primary fact per script** (ADR-007).
- Output: `hook / body / cta` + `claims[]` (each linked to `factId` + `sourceUrl`
  + `snippet`) + a self-rated **hook score** + the **publish package** (ADR-018):
  title, description, tags, hashtags, IG caption, thumbnail text, background/music
  — compliance footer/disclaimer + default tags applied deterministically from
  `Series.publishDefaults`.
- **Volume is dynamic** (ADR-008): generate up to the number of **novel**
  confirmed FactUnits available, novelty-checked (via `Angle.noveltyHash`)
  against previously produced angles. Never spam many scripts from few facts.

### 5) review — Human Gate 1
The single human gate. A Next.js dashboard (built later; this repo ships only
the **data model + stub REST API**). Queue sorted by **hook score**. Each card
shows hook + body and, beside each claim, its **source link, snippet, tier,
confidence**. Operator can **approve / edit / reject**; reject may **flag the
FactUnit** (`FactUnit.flaggedOut = true`) out of rotation.

Each card also shows **non-blocking review flags** (ADR-015) — e.g. *snippet not
found verbatim in source*, *single source / uncorroborated*, *rumor or open-web
tier*, *stale source*. Flags only warn and explain; they never auto-delete or
auto-reject. The operator reads them and decides.

Stub REST endpoints (see `apps/ideation/src/modules/review`):
- `GET  /review/queue`            — list DRAFT scripts sorted by hook score
- `POST /review/:id/approve`      — mark APPROVED, set `approvedAt`
- `PATCH /review/:id`             — edit (`editedBody`)
- `POST /review/:id/reject`       — mark REJECTED, optionally flag FactUnit

## Data model

Prisma / PostgreSQL. Full schema: `apps/ideation/prisma/schema.prisma`.

| Model      | Role |
|------------|------|
| `Series`   | Configurable niche/format: voice/tone, format rules, min confidence, allowed tiers. First-class per ADR-006. |
| `Fact`     | One **raw sourced claim**: claim + sourceUrl + snippet + sourceTier. |
| `FactUnit` | A **clustered** canonical claim across corroborating `Fact`s: confidence, corroborationCount, isRumor, flaggedOut. |
| `Angle`    | A proposed take on a primary FactUnit for a Series: hook, angleType, noveltyHash (unique), score, status. |
| `Script`   | The written output of an Angle: hook/body/cta, claims (JSON), wordCount, estDurationSec, hookScore, status, editedBody, approvedAt. |
| `Post`     | A posted clip + its hand-entered performance snapshot, one per (Script, Platform). Feeds the metrics → hook-scoring loop (ADR-020). |

Enums: `Confidence` (CONFIRMED / STRONG_RUMOR / RUMOR), `AngleType`
(FACT / LIST / EXPLAINER / COMPARISON / PREDICTION), `AngleStatus`
(PROPOSED / GENERATED / PRODUCED / REJECTED), `ScriptStatus`
(DRAFT / APPROVED / REJECTED), `Platform` (YOUTUBE / INSTAGRAM).

Relationships:
- `Series` 1─∞ `Angle`, `Series` 1─∞ `Script`.
- `FactUnit` 1─∞ `Fact`, `FactUnit` 1─∞ `Angle` (as primary fact).
- `Angle` 1─1 `Script`.

## Job flow & status transitions

```
Angle.status:   PROPOSED ─(generate)─▶ GENERATED ─(approved+rendered later)─▶ PRODUCED
                     └────────────────────────────────────────(reject)─▶ REJECTED
Script.status:  DRAFT ─(Gate 1 approve)─▶ APPROVED
                   └──(Gate 1 reject)──▶ REJECTED   (may set FactUnit.flaggedOut)
```

## Export contract

The **stable boundary** the later render/publish halves consume (ADR-009). An
**APPROVED** `Script` is the interface. Typed shape lives in
`packages/shared/src/index.ts`:

```ts
interface ScriptExport {
  seriesKey: string;        // Series.key, e.g. "example"
  hook: string;
  body: string;             // editedBody ?? body
  cta: string;
  claims: ScriptClaim[];    // { factId, sourceUrl, snippet }
  estDurationSec: number;
  publish?: PublishPackage; // Gate-1 upload metadata (ADR-018)
}
```

Downstream (not built here):
- **RENDER** = Remotion (muted cleared background + ElevenLabs voiceover +
  word-timed captions + YouTube Audio Library music).
- **PUBLISH** = YouTube Data API v3 (~6 uploads/day on the default 10k quota) +
  Instagram Graph API Content Publishing (~25/day). Both behind **Human Gate 2**.

### Publishing pipeline (phase 4 — not built yet)

How approved scripts become scheduled posts:

1. An APPROVED `Script` is rendered, and the finished clip enters an
   **upload queue (FIFO)**.
2. A scheduler fires at **fixed daily slots** (2–3/day) and publishes the
   **oldest** queued clip first.
3. **Gate 2 is a spot-check:** rendered clips sit in the queue as `pending` and
   auto-post at their slot **unless the operator vetoes**. This keeps the flow
   hands-off while preserving a human veto.

- **Channels:** YouTube Shorts + Instagram Reels only (no TikTok — see ADR-003).
- **Audience target:** US / UK (Shorts ad revenue pools by viewer country, so
  slots aim at US afternoon/evening).
- **Manual-phase shortcut:** until the API poster exists, use the **native
  schedulers** in YouTube Studio + Meta Business Suite for fixed-slot
  publishing. Do **not** build the API poster early.
- **Future models (phase 4, do not add now):** an `UploadQueue` / `Post` entity
  — render ref, platform, `scheduledAt`, `state`, `externalId`.

## LLM abstraction

`packages/llm` exposes a provider-agnostic `LlmProvider` interface, selected via
the `LLM_PROVIDER` env var. `extract` and `generate` depend on the interface,
never a concrete SDK. Providers:

- **`gemini`** (default) — Google Gemini on the **free tier**, as a
  **quality-ranked fallback queue** (ADR-012): best model first, auto-falls to
  the next on a capacity error (rate limit / quota / unavailable), no manual
  retries. Queue is editable via `GEMINI_MODEL_QUEUE` (defaults to `-latest`
  aliases); needs `GEMINI_API_KEY`. A content block or genuine error is
  surfaced, not retried elsewhere; a spent queue throws `AllModelsExhaustedError`.
- **`manual`** (ADR-013) — no API; renders a copy-pasteable prompt and throws
  `ManualInterventionRequired` for the operator to run by hand and paste back.
  The zero-cost option and the fallback when automation is blocked.
- **`anthropic`** — Claude API stub, for an optional paid upgrade later.

The client is created lazily, so the app boots without any key set.

## Current scaffold status

Everything in this repo is **scaffold + stubs** — no scraping, no LLM calls, no
generation logic. Services and processors carry correct signatures and `TODO`
comments referencing this document. See `CLAUDE.md` → **Current Status**.
