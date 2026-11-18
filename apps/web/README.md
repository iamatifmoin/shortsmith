# apps/web — Dashboard

Next.js dashboard for the operator. It has four boards: **Review** (Human Gate 1 —
read the hook, body and upload details, check each claim against its source, then
**approve**, **edit**, or **reject**), **Publish** (Gate 2 scheduling), **Performance**
(the metrics-feedback loop), and **Setup** (the `/setup` channel wizard that
configures the channel — subject, personality, branding, sources, cadence). On a
fresh database the dashboard redirects to `/setup`.

## How it works

- It consumes the review API served by `apps/ideation` (`/review/*`). The
  browser never calls that API directly — Next.js route handlers under
  `app/api/review/*` proxy to it server-side, so there is no CORS to configure.
- The ideation API base URL comes from `IDEATION_API_URL` (see
  `.env.local.example`; defaults to `http://localhost:3001`).
- All operator-facing wording is plain and self-explanatory. The pipeline's
  internal codes (flag slugs, confidence enums, source tiers) are mapped to
  simple sentences in `lib/labels.ts`.

## Layout

- **Left — the queue:** draft scripts, strongest hook first, each showing its
  hook-strength score, confidence, and how many things are worth checking.
- **Right — the script:** editable hook / body / call-to-action, the upload
  details (title, description, tags, caption, thumbnail words, background,
  music), the non-blocking review warnings, and the sources behind every claim.

## Run it

1. Start the ideation API (serves `/review/*`):

   ```bash
   pnpm ideation:start
   ```

2. In another terminal, start the dashboard:

   ```bash
   pnpm --filter @shortsmith/web dev
   ```

3. Open http://localhost:3000.

See [`../../docs/roadmap.md`](../../docs/roadmap.md) (Phase 2) and
[`../../docs/architecture.md`](../../docs/architecture.md) (review stage).
