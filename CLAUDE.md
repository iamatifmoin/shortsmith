# CLAUDE.md — orientation & index

> Fresh session? Start here. This file is the **map, not the territory** — it is
> deliberately short. Each topic's detail lives in one `docs/*` file, linked from
> [Start here](#start-here). When this file and a doc disagree, **the doc wins.**

## What this is

**Shortsmith** is a semi-automated, **human-in-the-loop** short-form video
pipeline for a **faceless** YouTube Shorts + Instagram Reels channel about **any
niche**. The subject, personality, branding, sources and cadence are all
**per-channel configuration** (a `Series` row, filled in through the setup
wizard) — nothing about the topic is hardcoded. A person clones the repo, runs it
locally, fills in their channel, and the pipeline starts generating videos for
them.

**The pipeline has two halves.** The IDEATION half turns web sources into
review-ready scripts, ending at **Gate 1 (script review)**. The RENDER/PUBLISH
half turns an APPROVED script into a finished vertical clip and hands it to the
operator to post. The boundary between them is one stable **export contract**: an
APPROVED `Script` carrying `{ seriesKey, hook, body, cta, claims[],
estDurationSec }` (defined in `packages/shared`). Full product definition:
[docs/product.md](./docs/product.md).

## Non-negotiables (don't break these)

Locked decisions; the rationale for each is in
[docs/decisions.md](./docs/decisions.md).

- **No copyrighted footage of the subject, ever** — the background is unrelated
  **cleared, muted** footage (e.g. a cleared gameplay loop or operator-owned
  clips); all subject content lives in the voiceover + captions. The script is the
  product. (ADR-002)
- **Grounded, source-traceable claims only** — harvest a per-channel ranked
  **whitelist** (the `Source` rows set in the setup wizard) first; the open web is
  allowed only as the **lowest, always-rumor tier** the operator judges at Gate 1
  (ADR-005/014). Every claim links to its source URL + snippet + tier. (ADR-005)
- **Two human gates; nothing auto-publishes without a human approving.** (ADR-004)
- **Niche/channel is configuration, not code.** (ADR-006)
- **One primary fact per script**, with **dynamic volume** — generate only up to
  the number of novel eligible facts available. (ADR-007/008)
- **Platforms = YouTube Shorts + Instagram Reels only** (no TikTok). (ADR-003)

## Stack & conventions

- **TypeScript monorepo, pnpm workspaces** (`apps/*`, `packages/*`). Internal
  names `@shortsmith/shared`, `@shortsmith/llm`, `@shortsmith/ideation`, linked
  `workspace:*`.
- `apps/ideation` — **NestJS + BullMQ (Redis) + Prisma (PostgreSQL)**. Each
  pipeline stage is a BullMQ job; a row walks the pipeline via a status field. Also
  serves the `/channel` config API the setup wizard writes to.
- `packages/shared` — export-contract types + enums (framework-free). Its enums
  **mirror** `apps/ideation/prisma/schema.prisma` — change both together.
- `packages/llm` — provider-agnostic LLM interface, selected via `LLM_PROVIDER`.
  Default **Gemini** (free-tier quality-ranked fallback queue, ADR-012) + a
  **manual** paste mode (ADR-013); Claude/Anthropic is a stub for a later paid
  upgrade. Adding a provider never touches callers.
- `apps/web` — **Next.js dashboard**: the Gate 1 review board, the publish board,
  the performance board, and the **`/setup` channel wizard**.
- `apps/render` — **Remotion** render pipeline (approved script → vertical clip).
- `docker-compose.yml` — Postgres 16 + Redis 7 for local dev.

**Code conventions**

- A stage lives in `modules/<stage>/` as a **service** (logic) + a **processor**
  (the BullMQ worker that calls the service).
- Reach LLMs only through the `packages/llm` interface — **never** import a
  vendor SDK directly in a stage.
- Take dependencies (Prisma, the LLM provider) via **Nest DI**; don't `new` them
  inside a service.
- Everything niche-specific is **data on the `Series`/`Source` rows**, read at
  runtime — never a literal in a prompt, config file or constant.

Architecture detail: [docs/architecture.md](./docs/architecture.md).

## How to run

Full steps and Windows notes are in the [README](./README.md#quick-start). Short
version: `pnpm install` → `docker compose up -d` → copy the two `.env.example`
files → `pnpm prisma:generate` → `pnpm prisma:migrate` → `pnpm -r build` →
`pnpm dev`. Then open the dashboard and complete the **`/setup` wizard** to
configure your channel (subject, personality, branding, sources, cadence) — on a
fresh database the dashboard redirects there automatically. The app **boots
without Postgres/Redis** (connections retry in the background), but stages can't
run until both are up and a migration is applied. Root shortcuts: `pnpm db:up`,
`pnpm ideation:dev`, `pnpm prisma:generate`, `pnpm prisma:migrate`.

To run it **24/7 in the cloud for free** (so it no longer depends on your laptop),
see [docs/deploy-oracle.md](./docs/deploy-oracle.md) — a lift-and-shift onto one
Oracle Cloud Always-Free VM, with the scripts in [`deploy/`](./deploy).

## Current status

The full pipeline is built end-to-end: **ideation** (harvest → extract → rank →
generate → review), the **Gate 1 dashboard** + performance-feedback loop, the
**render** pipeline (approved script → finished vertical clip), and
**notification-assisted manual publishing** (ADR-030..034). The channel-agnostic
template layer — per-channel `Series`/`Source` config, parameterized prompts, the
`/channel` API and the `/setup` wizard — makes all of it niche-neutral so anyone
can run it for their own channel.

| Area | State |
|------|-------|
| Monorepo, workspaces, tsconfig, docker-compose, env examples | **Complete** |
| Prisma data model (`apps/ideation/prisma/schema.prisma`) | **Complete** |
| `packages/shared` export-contract types + enums | **Complete** |
| `packages/llm` interface + Gemini provider (+ manual mode) | **Complete** (Anthropic stub for a later paid upgrade) |
| `apps/ideation` harvest / extract / rank / generate / review | **Complete** |
| Per-channel sources + topic terms (`Source` rows, open-web Tier-4 fallback) | **Complete** |
| `review` REST API + Gate 1 publish package (ADR-018) | **Complete** |
| `/channel` config API + `apps/web` `/setup` wizard | **Complete** |
| `apps/web` (Next.js dashboard) + metrics feedback (ADR-020) | **Complete** |
| `apps/render` (Remotion) | **Core complete** (ADR-021..029); music bed deferred |
| Publishing (notification-assisted manual posting, ADR-030..034) | **Complete**; automated API poster deferred |

## Roadmap

The ideation engine, render pipeline, notification-assisted publishing and the
channel-agnostic template layer are built. Next: the automated API poster, and
deeper per-channel onboarding polish. Detail: [docs/roadmap.md](./docs/roadmap.md).

## Start here

- [docs/product.md](./docs/product.md) — product definition, goals, the two gates.
- [docs/decisions.md](./docs/decisions.md) — every locked decision + rationale (ADRs).
- [docs/architecture.md](./docs/architecture.md) — stages, data model, job flow,
  export contract, monorepo layout.
- [docs/sources.md](./docs/sources.md) — tiered sources + confidence rules.
- [docs/operations.md](./docs/operations.md) — platforms, audience, cadence,
  compliance, per-clip clearance, metrics to log.
- [docs/operator-guide.md](./docs/operator-guide.md) — the day-to-day runbook:
  every operator step (start/stop, ingest footage, fetch, review, publish via
  Telegram, change the schedule) with the exact command or click.
- [docs/deploy-oracle.md](./docs/deploy-oracle.md) — run the whole pipeline 24/7
  from anywhere, for free, on one Oracle Cloud Always-Free VM (lift-and-shift:
  Postgres + Redis + the three apps under PM2 + Cloudflare Tunnel). Artifacts in
  [`deploy/`](./deploy).
- [docs/go-live.md](./docs/go-live.md) — launch strategy, recommended posting
  times, how to track what works, and the pre-flight checklist.
- [docs/shorts-spec.md](./docs/shorts-spec.md) — the Shorts production contract
  (length, format, structure, audio, visuals) the render half implements.
- [docs/phase-3-render.md](./docs/phase-3-render.md) — render design & decisions
  (ADR-021..025): architecture, voiceover, captions, footage, thumbnail.
- [docs/roadmap.md](./docs/roadmap.md) — phases.
- `apps/ideation/prisma/schema.prisma` — the data model (the backbone).

> Some `docs/*` files and the ADR log still use the project's original launch
> niche in their examples; they're being generalized. The code is niche-neutral —
> when an example there looks topic-specific, treat it as illustrative.
