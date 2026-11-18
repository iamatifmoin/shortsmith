# Product Definition

## What it is

**Shortsmith** is a semi-automated, **human-in-the-loop** short-form video
content pipeline. It runs a **faceless** YouTube Shorts + Instagram Reels channel
about **whatever niche the operator configures**.

The niche/channel is a configurable, first-class entity (`Series`, filled in
through the setup wizard) — never hardcoded. Adding a new channel or changing the
subject, personality, branding, sources or cadence is a data change, not a code
change.

## Goals

- Run a **low-input, mostly-automated but human-steered** content operation.
- **Keep running cost near zero.**
- **Keep the operator's daily effort to ~15–20 minutes of review.**
- Stay niche-neutral: one codebase, any channel.

## The full product: three halves, two gates

The product is three halves connected by two human approval gates. **Nothing
auto-publishes without a human approving.**

1. **IDEATION** — web sources → review-ready scripts.
   - Ends at **Human Gate 1 = script review.**
2. **RENDER** — approved script → finished vertical video.
3. **PUBLISH** — finished video → YouTube / Reels (notification-assisted manual
   posting).
   - Includes **Human Gate 2 = finished-video review.**

```
  web sources
      │
      ▼
 ┌───────────┐     Gate 1      ┌───────────┐     Gate 2      ┌────────────┐
 │ IDEATION  │ ─ script review │  RENDER   │ ─ video review  │  PUBLISH   │
 │           │ ───────────────▶│           │ ───────────────▶│            │
 └───────────┘   APPROVED Script└───────────┘  approved video └────────────┘
                 = export contract
```

## The two human gates

- **Gate 1 — Script review.**
  The operator reviews generated scripts in the dashboard. The queue is sorted by
  hook score. Each card shows hook + body and, beside each claim, its source link,
  snippet, tier, and confidence. The operator can **approve / edit / reject**. A
  reject can **flag the underlying FactUnit** out of rotation.

- **Gate 2 — Finished-video review.**
  The operator reviews the rendered video before anything is uploaded.

## Why faceless / no footage of the subject / these platforms

See [decisions.md](./decisions.md) for the full rationale. In short:

- **Faceless:** the operator needs no camera, no on-screen presence, and no
  first-party footage of the subject.
- **No copyrighted footage of the subject:** rights-holders copyright-strike reuse
  of trailers/clips, and leaked footage is off-limits. Each video uses
  **unrelated, cleared background footage** (e.g. Minecraft parkour — Mojang
  explicitly permits monetized gameplay video — or operator-owned clips),
  **muted**, with the subject content living entirely in the **voiceover +
  captions**. The script is the product.
- **Platforms = YouTube Shorts + Instagram Reels only.** TikTok is out of scope.
