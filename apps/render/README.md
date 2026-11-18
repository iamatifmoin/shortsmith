# apps/render — Render pipeline (Phase 3)

Turns an **APPROVED** script into a finished vertical video. A standalone NestJS
service and **BullMQ worker** on the shared Redis (ADR-021). It consumes only the
**export contract** (`packages/shared` → `ScriptExport`) over HTTP — never ideation
internals — and reports status back so ideation's Postgres stays the source of
truth.

Design & decisions: [docs/phase-3-render.md](../../docs/phase-3-render.md) and
ADR-021..025 in [docs/decisions.md](../../docs/decisions.md).

## Flow

```
Gate 1 approve ──> ideation enqueues `render` job + RenderJob(QUEUED)
                      │
                      ▼
           apps/render worker (this app)
   GET /review/:id/export ──> ScriptExport
   voiceover (ElevenLabs) ─> captions ─> background clip ─> Remotion ─> thumbnail
   POST /render/jobs/:id/status ──> RENDERING … DONE { paths, durations, assets }
```

- **One output** (1080×1920 9:16) serves both YouTube Shorts and Reels.
- Cancellable: `POST /render/:scriptId/cancel` on ideation; the worker polls and aborts.

## Status — scaffolded (this pass)

Wired but not yet implemented:

| Piece | State |
|-------|-------|
| Service + BullMQ worker + Redis wiring | **Done** |
| Ideation client (export fetch + status callbacks) | **Done** |
| RenderJob lifecycle (enqueue on approve, cancel, callbacks) | **Done** (ideation side) |
| Asset library layout (`assets/`) + provenance templates | **Done** |
| Voiceover (ElevenLabs Turbo v2.5 + word timestamps) | **Done** (step 3) |
| Footage ingestion (crop → 9:16, mute, slice to pool) | **Done** (step 4) |
| Random background clip selection + quick cuts | **Done** |
| Remotion composition (split, graphics, captions, cuts) + thumbnail | **Done** |
| RenderRunner wired (approve -> render -> report DONE) | **Done** |

Approving a script enqueues a render; the worker fetches the `ScriptExport`, voices
it, picks + cuts background clips, composes with Remotion, and reports `DONE` with
the output paths. The visual spec / source / confidence come from the script when
present and are derived with fallbacks until the generation stage fills them (ADR-028).

## Run (local)

```bash
cp apps/render/.env.example apps/render/.env   # fill ELEVENLABS_API_KEY
pnpm --filter @shortsmith/render build
pnpm render:dev
```

Needs Redis up (`pnpm db:up`) and the ideation service running (`pnpm ideation:dev`)
for the export + callback endpoints.

## Ingest footage (ADR-024)

Turn one long landscape source into a pool of muted, vertical (1080×1920) clips:

```bash
pnpm --filter @shortsmith/render build
pnpm --filter @shortsmith/render ingest -- --file "C:\clips\mc-parkour.mp4" --source-url "https://youtu.be/..." --game minecraft --clip-seconds 30
```

- Center-crops landscape to 9:16, strips audio, slices into ~`clip-seconds` clips
  under `assets/backgrounds/<game>/`.
- `--source-url` is **recorded + license-checked only** (we never download from
  YouTube); provenance is appended to `assets/backgrounds/LICENSES.md`.
- `--delete-source` removes the big original after slicing (disk-friendly).

## Smoke-test the voiceover (ADR-022)

```bash
pnpm --filter @shortsmith/render tts:smoke        # built-in sample
pnpm --filter @shortsmith/render tts:smoke -- "hook" "body" "cta"
```

## Assets (`assets/`, kept local — see `.gitignore`)

```
assets/
  backgrounds/minecraft/   # muted vertical clips (ingest output)   — ADR-024
  music/<mood>/            # mood-tagged tracks                     — ADR-023
  fonts/                   # caption font(s)                        — ADR-023
```

Media files are gitignored; the `LICENSES.md` provenance files are tracked.
