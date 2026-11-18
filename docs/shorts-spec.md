# Shorts production spec

The production **contract** the rendering half (phase 3) implements. Keep it in
sync with the ideation rules (one fact per script) and the export contract.
**Exact fonts, colors, and the specific ElevenLabs voice are operator-owned**
and live in the operator's brand doc, not here.

> **Phase 3 build decisions refine this spec — see ADR-021..025 and
> [phase-3-render.md](./phase-3-render.md).** Where they differ, the ADRs win.
> Notably: **continuous** full-frame gameplay (no forced 2–3s cuts), **no
> watermark**, and brand-magenta word highlighting.

## Format

- **Length:** target **20–34s**; **hard cap under 60s** — Shorts over 1 minute
  with any copyright claim are **blocked** (not just demonetized).
- **Resolution:** 1080×1920, **9:16**, 30fps.

## Structure (one primary fact per clip)

Mirrors the ideation `one-fact-per-script` rule.

1. **Hook (0–3s)** — the spoken hook, shown as big on-screen text.
2. **Fact (3–~25s)** — the single confirmed fact; pacing comes from the
   word-by-word caption pops over **continuous** gameplay (ADR-023 drops the
   earlier forced hard-cut/zoom every 2–3s, which hurt retention).
3. **CTA (last ~3s)** — "follow for daily the subject".

## Audio

- **Voiceover:** ElevenLabs synthetic voice (specific voice = operator choice),
  brisk pace (~165 wpm).
- **Music:** YouTube Audio Library, upbeat, low under the voice.

## Visuals

- **Background:** muted, cleared gameplay (e.g. Minecraft parkour / endless-runner
  style), varied per clip. Never the subject footage — see
  [operations.md](./operations.md#per-clip-clearance-checklist).
- **Captions:** big, bold, **word-by-word** pop, centered slightly below middle,
  with a stroke/shadow for legibility over gameplay.
- **Watermark:** none burned into the video (ADR-023; the brand watermark asset
  exists but is applied at the platform level, not in-frame).
- Font + color choices = operator brand doc; caption highlight uses brand magenta
  (ADR-023).
