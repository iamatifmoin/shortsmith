# Content strategy — why anyone watches & subscribes

> The north star for *what* we make, not *how* we render it. Written after the
> first end-to-end render exposed the real problem: the pipeline worked but the
> content had no reason to exist for a viewer. Locked decisions here are ADR-026..028.
> Last updated: 2026-11-04. **the subject launches 2026-11-19 — 15 days out.**

## The problem we're fixing

The first clip was technically fine but delivered **no value**: we talked about
the subject while showing Minecraft, the script said nothing specific ("the map is way
bigger than anyone expected"), and nothing gave a viewer a reason to come back.
Three gaps:

1. **Visual disconnect** — we never *show* what we're talking about.
2. **No script substance** — vague, no numbers, no source; could be about any game.
3. **No reason to subscribe** — disposable, no series, no identity, no payoff loop.

## Why people watch the subject content (the demand)

- **Concrete new information** — confirmed features, map details, release logistics.
  Specificity *is* the value.
- **Hype / FOMO** — nobody wants to miss anything before launch.
- **Settle debates & take sides** — rankings, comparisons, "is it worth it".
- **A trusted filter** — the subject-leak space is mostly clickbait and fake leaks.

They **subscribe** when the channel becomes a *show*: consistent format, a clear
ongoing promise, a recognizable identity, and cliffhangers.

## The core constraint & its resolution

The visual disconnect is a direct consequence of **ADR-002 (no the subject footage, ever)**.
We keep ADR-002, and solve visual connection with content we're allowed to use:

- **Original, generated graphics** (zero copyright risk): stylized maps (Leonida /
  the setting), **comparison** graphics (the subject vs the subject 5), **stat callouts**, **feature
  cards**, **timelines**. Remotion is already excellent at this.
- **Source citations on screen** — "📰 the rights-holder Trailer 1" / a screenshot of the
  very article we sourced the claim from (defensible as citation; also builds trust).
- **Licensed stock of real Miami/Florida** for Vice-City ambiance (legal, evocative).
- *If* those prove insufficient, revisiting ADR-002 (e.g. trailer stills under
  news/commentary) is a deliberate, risk-weighed decision — not the default.

## What changes (the five moves)

1. **Visual = information (split layout).** Top half = original subject graphics
   (map / comparison / stat / feature / source-cite / badge); bottom half = the
   Minecraft retention strip. The top is where the per-fact motion lives. (ADR-027)
2. **Substance-first scripts.** One concrete, surprising, *specific* fact with the
   number/detail and the **source named out loud**. The grounding engine already
   has sourced claims — surface the specificity; don't bury it under personality. (ADR-028)
3. **A series with a promise.** Lean into the countdown: **"Countdown to the subject"**,
   one confirmed feature a day, on-screen "N DAYS LEFT". The CTA gives a *reason*
   to follow, not a ritual ("follow — every confirmed feature until launch").
4. **An identity / moat: trust + clarity.** *"The subject channel that sources
   everything — no fake leaks, only confirmed facts."* Make the **CONFIRMED /
   RUMOR badge** (we already compute confidence, ADR-005/015) a visible feature.
5. **Plan the lifecycle.** Pre-launch (now→Nov 19): countdown + confirmed features
   + hype. Launch day: coverage. **Post-launch (the evergreen goldmine): tips,
   secrets, easter eggs, money guides, "things you missed"** — the subject 5 content ran a
   decade on this. Each phase is a `Series` (ADR-006).

## Before / after

**Before:** Minecraft bg + "The map is way bigger than anyone expected." → scroll.

**After:** Top shows an original **Leonida map** with a size-comparison silhouette
("a whole STATE bigger than the subject 5"), a **✓ CONFIRMED** badge, **"Source: the rights-holder
Trailer 1"**, and **"15 DAYS LEFT"**. Voiceover: *"the rights-holder confirmed the subject's map
is the entire state of Leonida — bigger than all of the subject 5, with the setting at its
heart."* Bottom: Minecraft parkour. Captions sync. → the viewer *sees* it, *learns*
something specific, and *trusts* it.

## Sequencing (de-risk the big change)

1. **Render visual layer first** (this branch): split layout + a graphics-template
   library, driven by a hand-authored sample "visual spec". Produce a NEW sample
   clip to review — see the direction before industrializing it.
2. **Then ideation**: generate a structured **visual spec** per script + a
   substance-first copy pass (extends the export contract / publish package).
3. **Then series/phase config**: countdown + the post-launch formats.

Nothing built so far is thrown away — TTS, ingestion, captions, and the render
plumbing all stay. We add a *value layer* on top. The pre-rework state is tagged
**`checkpoint-render-v1`** on `main`; this work is on `feat/value-layer`.

## Decided (voice & personality)

- **Personality / tone = "B" — playful, cheeky, confident, flirty-*adjacent* (not
  explicit).** Full-flirty ("A") was auditioned and rejected: it fights the voice,
  risks Shorts/Reels reach + monetization, is hard to land faceless, and doesn't
  flex onto every daily fact. Personality lives in the writing + a light edge, not
  innuendo. Hooks can borrow the "shock / hot-take" lever for return-viewership.
- **Script phrasing: flowing complete sentences, but tight** — not choppy
  fragments (which make the AI voice sound robotic) and not rambling. Conversational
  but economical (~20–24s).
- **Voice = ElevenLabs voice `WZlYpi1yf6zJhNWXih74`** ("C"), **model
  `eleven_turbo_v2_5`** (natural at the cheap-tier cost; Multilingual v2 was better
  but ~2× credits, risking the Starter cap at daily cadence), with tuned
  `voice_settings` (lower stability + style + speaker boost) so it isn't robotic.
- **No visual rebrand** — magenta + the "the channel" name flex across tone; the
  name's playful double meaning suits the B personality.
- **SFX = real, free CC sounds (not synth), pinned.** A **whoosh** (Swipe Whoosh,
  qubodup) on the first visual swap and a **riser** (Swishes 12, videofueralle) on
  the FOLLOW screen, nothing in between, mixed low under the voice. Both **CC0** (no
  credit owed). Auditioned a batch and the operator picked these; pinned by source
  in `sfx.config.ts` so a role swaps in one line. Synth tone is the fallback. Music
  comes later.

> These feed the generation prompt rewrite (ADR-028 substance + B tone + flowing
> sentences) when we industrialize.

## Follow-ups / pre-publish to-dos (don't forget)

- **Image credits (pre-publish).** Unsplash's API terms (and CC-BY images) require
  attribution. We already CAPTURE each image's credit ("Photo by X on Unsplash") and
  fire the required download-trigger; still TODO: collect a clip's image credits and
  append them to the YouTube/Reels **description** at publish (Phase 4). Non-blocking
  while prototyping; required before posting clips that use Unsplash/CC-BY images.
- **Full end-to-end live run.** ✅ **DONE (2026-11-06).** Ran the whole loop live
  with both apps up against a real APPROVED script in the DB: `POST /review/:id/approve`
  → Script `APPROVED` → `RenderJob` auto-enqueued (QUEUED→RENDERING→**DONE**) → worker
  made a live ElevenLabs voiceover (31.5s), picked 13 Minecraft clips + SFX, composed in
  Remotion, and reported back — ideation's Postgres persisted the paths, duration, voice
  id and clip list (the ADR-020 feedback fields). Output: a 32 MB h264 1080×1920 clip +
  thumbnail. (The older pre-ADR-028 script had no visual-spec keywords, so `images=0`
  via fallback; a freshly generated script will carry b-roll keywords.)
- **Value layer reliably generated.** ✅ **FIXED (2026-11-06).** Found that the free
  Gemini tier dropped the ADR-028 `visual`/`broll` fields intermittently — a batch of
  14 fresh scripts came out with **none**, so they'd render plain (`images=0`). Hardened
  the `generate` stage: the prompt now marks `visual` + `broll` (≥2 cues) as MANDATORY,
  and `generateOne` **regenerates up to 3×** (feeding the model its own reply + a
  corrective nudge) until a script carries the full value layer, keeping the best parse
  as a fallback. Verified in-process: 4/4 regenerated scripts came out with
  `visual=headline` + `broll=2` (vs 0/14 before). A rendered clip confirmed the images
  reach the video (`images ok (2)`).
- **Image source:** Unsplash is the preferred provider; Pixabay stays in the seam for
  when its rate-limit clears; Openverse is the keyless fallback.
- **SFX credits:** current picks are CC0 (none owed). The renderer captures a credit
  for any CC-BY sound (same as images) → append to the description at publish (Phase 4).
- **Render browser:** Remotion needs a Chrome; we auto-detect an installed one (no
  `REMOTION_CHROME` set), so it never downloads its own (a sandbox-blocked fetch).
- **Later polish:** more graphic templates (map / feature card / timeline), caption
  tuning, a multi-beat top during the body, and 1080p+ source footage for a crisp
  bottom half.

## Open / to validate with the operator

- Caption placement/sizing + "other on-screen elements" (operator noted; minor).
- Full-magenta vs white+magenta-glow captions.
- Whether to relax **one-fact-per-script** (ADR-007) toward lists/comparisons where
  they deliver more value per view.
- Exact graphic art direction (map style, color system, fonts).
