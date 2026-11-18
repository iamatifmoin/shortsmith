# Decision Log (ADR-style)

Every decision below is **locked** unless a future ADR supersedes it. Each entry
records the decision and its rationale so future sessions understand *why* the
system is shaped this way.

---

## ADR-001 — Faceless format

**Decision:** The channel is faceless. No on-camera host, no gameplay the
operator records.

**Why:** The operator doesn't play the subject, has no console, and has no own footage.
The whole operation must run from a desk with a keyboard — ideation, review,
voiceover, captions — not from a capture card.

---

## ADR-002 — No footage of the subject, ever

**Decision:** Videos use **zero** footage of the subject. Background visuals are
**unrelated, cleared gameplay** (e.g. Minecraft parkour), **muted**. All subject
content lives in the **voiceover + captions**.

**Why:**
- Pre-launch, only trailers exist — there is no gameplay to legitimately use.
- the rights-holder aggressively copyright-strikes reuse of trailers and leaks.
- the rights-holder's fan-content policy is **non-commercial only** — incompatible with a
  monetized channel.
- Leaked footage is banned outright (legal + platform risk).
- Mojang **explicitly permits** monetized gameplay video, making Minecraft a safe
  cleared background source.

**Consequence:** The script (voiceover + captions) is the entire product. This
is why ideation quality is the whole game.

---

## ADR-003 — Platforms: YouTube Shorts + Instagram Reels only

**Decision:** Publish only to YouTube Shorts and Instagram Reels. **TikTok is
excluded.**

**Why:** TikTok's monetization/Creator program isn't available in every region
(including the operator's), so building for it would be wasted effort.

---

## ADR-004 — Not fully automated, on purpose (two human gates)

**Decision:** The pipeline is human-**steered**, not prompt-to-upload. Two human
gates (script review, finished-video review) are mandatory. Nothing publishes
without a human approving.

**Why:** YouTube's **"inauthentic content"** policy demonetizes / terminates
mass-produced, templated, prompt-to-upload AI channels. Mitigation:
- Two human gates.
- Genuinely valuable per-script writing.
- Real variation between videos (angles, structure, hooks).

This is a product constraint, not a nice-to-have. Automation that removes the
gates would defeat the business.

---

## ADR-005 — Misinformation defense: source tiering + traceability + grounded generation

**Decision:** Combat the subject fake-leak ecosystem with three mechanisms:
1. **Source tiering** — scrape a ranked **whitelist** (`config/sources.ts`),
   never the open web.
2. **Per-claim traceability** — every claim in a script links to the exact
   source URL + snippet + tier.
3. **Grounded generation** — scripts assert **only** scraped, sourced facts.

The operator validates at the single script-review gate; rejecting a script can
flag its underlying fact out of rotation.

**Why:** The subject web is full of fakes and a dedicated fake-leak industry.
Publishing a fake would destroy channel trust and invite strikes. Tiering +
traceability + grounding makes every published claim defensible and every
operator reject surgical.

**Confidence rules (see [sources.md](./sources.md)):**
- `CONFIRMED` = any Tier-1 source **OR** ≥2 independent Tier-2 sources.
- `STRONG_RUMOR` = exactly 1 Tier-2 source.
- `RUMOR` = Tier-3, or open web (Tier-4), only.

> **Amended by ADR-014:** the open web is now allowed as a **lowest,
> always-RUMOR tier (Tier 4)**, never auto-trusted — the operator judges it at
> Gate 1. "Never the open web" is superseded by "open web, but only as untrusted
> rumor the human vets."

---

## ADR-006 — Series / niche is a first-class, configurable entity

**Decision:** The "niche / series" is modeled as a `Series` row carrying voice/
tone, format rules, confidence threshold, and which source tiers it may use. New
series / niches are added **without code changes**.

**Why:** The product is named for the subject but must generalize. Hardcoding the subject would
trap the engine in one niche. A configurable Series lets the same engine run
"Example" (the subject, confirmed-only) and, later, any other niche.

**Pre-launch series:** `"example"` — confirmed-only.

---

## ADR-007 — One primary fact per script

**Decision:** Each generated script is grounded on **one primary FactUnit**
(plus optional supporting claims).

**Why:**
- It fits the Shorts format (one idea, ~30–45s).
- It makes the operator's reject **surgical** — rejecting a script cleanly maps
  to flagging one fact, not untangling a bundle.

---

## ADR-008 — Dynamic generation volume (scaled to scrape yield)

**Decision:** Generate **up to the number of novel confirmed FactUnits
available**, novelty-checked against previously produced angles. More facts
harvested → more scripts queued. **Never spam many scripts from few facts.**

**Why:** Volume should track real new information, not a fixed daily quota.
Fixed quotas force either starvation or fabrication; both are fatal (fabrication
trips ADR-005, starvation wastes the launch window).

---

## ADR-009 — Export contract is the stable boundary

**Decision:** An **APPROVED Script** carrying
`{ seriesKey, hook, body, cta, claims[], estDurationSec }` is the **interface**
between ideation and the later render/publish halves. This repo **documents**
the contract; it does not build render/publish.

**Why:** A stable, documented contract lets the three halves be built and
changed independently. Render (Remotion) and Publish (YouTube/IG APIs) consume
this shape and nothing else from ideation internals.

See [architecture.md](./architecture.md#export-contract) for the typed shape.

---

## ADR-010 — Tech stack & structure (locked)

**Decision:**
- TypeScript monorepo, **pnpm workspaces**.
- `apps/ideation` = **NestJS + BullMQ (Redis) + Prisma (PostgreSQL)**.
- `packages/shared` = shared types (export-contract types + enums).
- `packages/llm` = **provider-agnostic** LLM interface, selected via
  `LLM_PROVIDER`. Default is now **Gemini** (free tier; see ADR-012), with a
  **manual** paste mode (ADR-013); Anthropic/Claude is a stub for a later paid
  upgrade. Adding a provider never touches the calling stages.
- `apps/web` (Next.js review dashboard) and `apps/render` (Remotion) = placeholder
  folders with a README only, for now.
- `docker-compose.yml` for Postgres + Redis for local dev.

**Why:** A monorepo keeps shared types and the LLM abstraction in lockstep with
the services that use them. NestJS + BullMQ gives a clean module/queue structure
for a staged pipeline. Prisma gives a typed data model that *is* the pipeline's
backbone. Provider-agnostic LLM avoids vendor lock-in.

---

## ADR-011 — Pipeline stages are BullMQ jobs over Redis

**Decision:** Each ideation stage (harvest → extract → rank → generate → review)
is a **BullMQ job**. A row walks down the pipeline via a **status field**.

**Why:** Queues give retry, backoff, concurrency control, and observability for
free, and decouple stages so each can fail/scale independently. A status field
on the row makes pipeline position inspectable and resumable.

---

## ADR-012 — LLM provider: Gemini free tier via a quality-ranked fallback queue

**Decision:** The default LLM provider is **Google Gemini on the free tier**,
accessed as a **quality-ranked fallback queue**: the best model is tried first,
and on a capacity error (rate limit / quota / unavailable) the provider
automatically falls through to the next, lower-quality model — no manual
retries. Models are **editable config** (`GEMINI_MODEL_QUEUE`), defaulting to
floating `-latest` aliases so version churn doesn't break us. Claude API stays a
future paid upgrade (ADR-010); nothing but config changes to switch.

**Why:** Volume is a trickle and the free tier covers it at **₹0 / $0**. The
best free models carry the stingiest limits, so the queue naturally degrades
best→lighter as the day's quota burns — graceful by design. A capacity error
switches model; a **content block or genuine error is surfaced, not masked** by
retrying elsewhere. When the whole queue is spent, the work holds for the daily
reset (or the operator goes manual). Free-tier prompts may be used by Google to
improve its products — acceptable here, as we only send **public** the subject news.

---

## ADR-013 — Manual (human-in-the-loop paste) mode is a first-class LLM mode

**Decision:** Alongside automated providers, a **manual** provider
(`LLM_PROVIDER=manual`) renders each step into a copy-pasteable prompt the
operator runs in a chat UI (e.g. Claude Pro) and pastes back. It is both the
zero-cost option and the **fallback when automation is blocked**.

**Why:** It rides the Pro subscription the operator already pays for (no new
cost), gives maximum oversight (fits "the operator is the judge"), and unblocks
the pipeline when the free tier is exhausted. **Hard constraint:** it must be
genuine human copy-paste — automating a chat UI would breach its terms; only the
token-billed API may be driven programmatically.

---

## ADR-014 — Open web as a lowest-rank source tier (amends ADR-005)

**Decision:** The harvester may also search the **open web** as a **Tier-4**
source — ranked **below** the Tier-3 community whitelist, **always flagged
RUMOR**, never auto-trusted. The operator judges Tier-4 facts at Gate 1. This
**amends ADR-005**'s "never the open web."

**Why:** The whitelist can miss emerging stories; the open web widens coverage
without lowering the trust bar, because confidence is still tier-driven and a
human still gates everything. The pre-launch `"example"` series is
confirmed-only, so Tier-4 rumor never *generates* a script there — it is
harvested and visible, nothing more, until a rumor-tolerant series opts in.

---

## ADR-015 — Review flags: non-blocking warnings at Gate 1 (never auto-delete)

**Decision:** The review gate surfaces **non-blocking flags** on each script —
e.g. *quoted snippet not found verbatim in the source*, *single source /
uncorroborated*, *rumor or open-web tier*, *stale source*. Flags **warn and
explain**; they **never auto-delete or auto-reject**. The operator reads them
and decides.

**Why:** It is the anti-misinformation guard without false rejections (exact
snippet matching is brittle against paraphrase and messy HTML). It keeps the
human the judge (ADR-004) while making the ~15-minute review faster and sharper.

---

## ADR-016 — Deployment: on-demand local now, always-on host when publishing needs it

**Decision:** Phase 1 runs **on-demand, locally** (the operator triggers a run;
zero infra, zero hosting cost). A scheduled, always-on deployment is deferred to
**publishing (Phase 4)**, where posting to timed slots genuinely must run
without the operator present; the same app then moves to a cheap always-on host.

**Why:** Ideation gains little from 24/7 autonomy — the human review gate is the
very next step, so scripts just wait in a queue regardless of when they were
made. True autonomy has a real cost (an always-on machine), best paid only when
the time-critical half (publishing) exists. The app is host-agnostic, so "where
it runs" is a deployment flip, not a code change.

---

## ADR-017 — Channel voice & tone (starting direction, tunable)

**Decision:** The channel leans into its name's wordplay: a **playful, flirty,
lightly suggestive (PG-13) tone** with a **sultry female voiceover**. The spice
lives in the **hook and CTA**; the **fact itself is delivered straight and
clean**. Tone is **series configuration** (`voiceTone` + an allowed/banned
guardrail list), tunable per series and over time. This is a starting direction,
to be refined against real output.

**Why:** It differentiates a faceless fact channel and boosts engagement, while
keeping the suggestiveness to innuendo/wordplay (never explicit) to protect
monetization — the whole point of the project. Keeping the fact clean preserves
grounding (ADR-005). Banned: explicit content, crude anatomy, demeaning jokes.

---

## ADR-018 — Gate 1 produces the full upload "publish package"

**Decision:** Script review (Gate 1) approves not just the script but the whole
**upload package**: YouTube title (a hook with personality, keyword-first, lightly
playful — not a flat restatement of the fact), description, tags, hashtags,
Instagram caption, thumbnail text, and background/music suggestions. The
compliance footer + "not affiliated" disclaimer + AI disclosure + default tags are
applied **deterministically in code** from `Series.publishDefaults` (never
AI-generated), so every upload carries exact, correct compliance text. Only
render-dependent artifacts (thumbnail image, caption word-timing, final duration,
chosen clip) are deferred to Gate 2. The export contract (`packages/shared`
`ScriptExport.publish`) carries the package.

**Why:** The script gate is free (text); rendering is expensive (voiceover +
compute). Front-loading every human *decision* to the cheap gate means one
approval locks everything, shrinking Gate 2 to a quick "did it render right?"
spot-check — no paying to render a video whose title/description then need edits.
Deterministic compliance text guarantees the disclaimers are always present.
Metadata best practices are baked into the generator prompt: title as a hook with
the keyword near the front, 3-5 hashtags in the description, tags for
aliases/misspellings, a keyword-first IG caption. Emoji in titles is a
config toggle (`publishDefaults.emoji`), off by default.

---

## ADR-019 — Fact recency / supersession

**Decision:** Handle the subject-is-a-moving-target problem (e.g. an old "announced
for 2025" story vs the current Nov-2026 launch) pragmatically, without a full
contradiction engine:
1. **Capture each article's own publish date** (`SourceDocument.publishedAt`,
   from the RSS feed) at harvest.
2. **Generate skips clearly-stale facts** — FactUnits whose *newest* supporting
   source is older than `Series.formatRules.maxFactAgeDays` (default 120) — and
   orders the rest freshest-first (so a quota cap scripts current facts first).
   Facts with no known date are kept (can't prove staleness).
3. **Review flags `outdated`** when the newest source is older than
   `staleFlagDays` (default 45) and shows each claim's date — the operator makes
   the final call (the human gate stays the arbiter, ADR-004/005).

**Why:** Scripting a superseded fact would publish misinformation — the exact
failure the source-tiering design exists to prevent. "Old" is not the same as
"wrong" (a true structural fact keeps getting re-reported, so it stays fresh via
recent corroboration), so we gate on the *newest* source per unit, not blanket
age, and keep the human as the final judge rather than auto-deleting. Thresholds
are per-series config (ADR-006), tunable as the news cycle changes.

---

## ADR-020 — Performance metrics + feedback loop

**Decision:** Build the manual-learning half of Phase 2 as a closed loop:
1. **Capture** — a `Post` row per (approved `Script`, `Platform`) holds the
   operator's hand-entered performance snapshot (views, retention %, avg view
   duration, likes, comments, shares, subscribers gained) plus the posted link
   and time. Hook type / angle / primary fact / background are **derived** from
   the script's `Angle` + `FactUnit` + publish package, never re-entered
   (docs/operations.md "Metrics to log").
2. **Insights** — `PerformanceService` turns posts into a 0-1 performance score
   per clip (retention-weighted, then reach / engagement / subs, each min-max
   normalized across the dataset so one viral clip can't dominate), aggregated
   into leaderboards by **angle type, hook opener, and fact confidence** and
   surfaced on the dashboard's Performance screen.
3. **Feed back** — once there are enough posts (`MIN_POSTS_FOR_FEEDBACK`, and
   per-bucket `MIN_BUCKET_POSTS`), `generate` blends the learned performance of
   the chosen angle type + hook opener into the stored hook score
   (`Angle.score` keeps the raw LLM self-rating; `Script.hookScore` — what the
   review queue sorts by — is the adjusted one) and injects a short "what's
   working" line into the scriptwriter prompt to steer angle selection.

Hook openers are bucketed by a small deterministic classifier shared between the
generator and the metrics engine (`classifyHookOpener` in `packages/shared`).

**Why:** The roadmap's Phase 2 is "learn what hits, then feed it back into hook
scoring + angle selection." Manual metric entry keeps cost at zero and fits the
native-scheduler posting flow (no analytics-API integration yet, mirroring the
"don't build the API poster early" stance of ADR/Phase-4). The feedback is
**gated and bounded** (neutral until there's real data; a clamped nudge, not a
takeover) so it never destabilizes the already-tuned generator, and the human
gate stays the arbiter (ADR-004). Scoring leans on retention because it is the
dominant Shorts signal, and normalizes within the dataset so early, low-view
numbers still rank sensibly.

---

## ADR-021 — Rendering architecture (Phase 3)

**Decision:** The render half is a **standalone service in `apps/render`**, not a
module inside `apps/ideation`:
1. It is a **BullMQ worker on the shared Redis**, consuming a new `render` queue.
   Approving a `Script` (Gate 1) **auto-enqueues** `{scriptId}`; the operator can
   **cancel** a queued/running render.
2. It consumes **only the `ScriptExport` contract** (`packages/shared`), fetched
   via the review API — never ideation internals (ADR-009).
3. State lives in a new **`RenderJob`** row (status
   QUEUED/RENDERING/DONE/FAILED/CANCELLED, output + thumbnail paths, real
   duration, assets used, error, timestamps); the ideation Postgres stays the
   single source of truth, written via a callback.
4. **One output file serves both platforms** — YouTube Shorts and Instagram Reels
   are both 1080×1920 9:16; the per-platform difference is metadata (title vs
   `igCaption`), handled at publish time. No double render.
5. **Local-only** on the operator's machine for now (ADR-016); a successful render
   is marked ready for the Phase-4 upload queue.

**Why:** Remotion wants its own process, so a separate app is cleaner than a Nest
module, while reusing the existing BullMQ/Redis job fabric keeps the pipeline
consistent (ADR-011) and cancellation trivial. Consuming the export contract and
nothing else preserves the stable boundary (ADR-009) so the render half can evolve
independently. One file for both platforms avoids wasted renders on identical
video. Remotion's Free License covers solo commercial use, so the engine is free.

---

## ADR-022 — Voiceover: ElevenLabs via a provider interface (Phase 3)

**Decision:**
1. Reach TTS **only through a small provider interface** (mirroring `packages/llm`,
   ADR-012), so the engine never imports a vendor SDK directly. Default provider =
   **ElevenLabs**, model **`eleven_turbo_v2_5`** (natural voice at the cheap-tier cost; tuned voice_settings). A **manual mode**
   (operator supplies an audio file) is a first-class fallback (mirrors ADR-013).
2. Word-level caption timing comes from **ElevenLabs' `with-timestamps` endpoint**
   — no separate forced-aligner.
3. Synthesize the **whole script in one request** (hook / body / CTA joined by
   newlines) so the audio is **one seamless piece** — generating the three parts
   separately and stitching them with inserted silence left an audible
   ambient-floor "cut" at each join. Pauses come naturally from the section
   breaks; section spans are recovered from the word timings.
4. **Actual rendered audio length overrides `estDurationSec`** as the final video
   length.
5. **Cache audio keyed to script version** — an unchanged approved script never
   re-voices (saves credits); an edit re-voices.
6. The API key is read from `ELEVENLABS_API_KEY` (env), never logged.

**Why:** The provider interface keeps the vendor swappable and the manual fallback
alive for when free/cheap credits run out — the same resilience stance as the LLM
layer. Turbo v2.5 + version-keyed caching keeps the ElevenLabs Starter plan (~$5/mo,
commercial license) comfortably ahead of 2–3 clips/day. Pulling timestamps from the
TTS itself is exact and avoids a second heavy dependency. Trusting measured audio
length over the estimate keeps captions and video in sync.

---

## ADR-023 — Visual composition & captions (Phase 3, amends shorts-spec)

**Decision:**
1. **Full-frame gameplay background** (1080×1920 9:16, 30fps), **muted**, playing
   **continuously** — that steadiness *is* the retention mechanic. The earlier
   top/bottom split is dropped, and so is the spec's forced "hard cut/zoom every
   2–3s" (forcing cuts hurts retention); an optional subtle punch-in can be added
   later.
2. **Captions overlaid**, **Hormozi-style**: **one word at a time**, **UPPERCASE**,
   heavy font, white fill + thick black stroke, centered lower-third, small pop on
   each word, and the **spoken word highlighted in brand magenta** (sampled from
   `brand/` artwork) — our twist on the usual green.
3. **No watermark in the video** (operator preference; the brand asset exists but
   isn't burned in).
4. **No intro/outro — straight into the hook**; simple hard cuts between
   hook → fact → CTA.

**Why:** Overlaid captions on full-frame continuous gameplay is the proven
retention format and removes the split-layout's awkwardness around where motion
lives. Word-by-word caption pops carry the rhythm that the dropped cuts would have.
Brand-magenta highlighting keeps the familiar high-retention caption style while
making it ours. This supersedes the watermark and caption/visual details in
[shorts-spec.md](./shorts-spec.md); exact font/colors remain operator-tunable
(ADR-017's "starting direction, tunable" spirit).

---

## ADR-024 — Background footage: Minecraft, clearance, and ingestion (Phase 3)

**Decision:**
1. **"Cleared" requires two layers, both mandatory (extends ADR-002/005):**
   (a) the game's **publisher permits monetized video**, and (b) we **own the
   footage** (self-captured) **or hold a real CC0/royalty-free license** we can
   evidence. "Downloadable" ≠ "licensed"; reusing another creator's clip infringes
   *their* copyright regardless of the game's policy.
2. **Primary background = Minecraft** — Mojang/Microsoft permit creating and
   monetizing Minecraft gameplay video, and it's the unrelated-gameplay example
   ADR-002 already names. **the subject footage is rejected** (the rights-holder permits
   non-commercial use only; a monetized channel is commercial; and showing the
   subject on a subject-focused channel defeats ADR-002's point). bbounce.app (owned "satisfying-rings" exports)
   is shelved as a possible paid add-on, not now.
3. **Ingestion pipeline:** operator drops a **muted landscape source file** and
   passes the **YouTube URL as provenance only**. One command **center-crops to
   9:16, strips audio, normalizes to 1080×1920 30fps, slices into short clips**
   (~25–40s) into the local pool, logs source + license in `LICENSES.md`, and may
   delete the big source (disk-friendly). **We never download from YouTube** — the
   URL is only read for its license metadata (CC / reuse-allowed?), which stays
   within YouTube's terms. Render picks a **random clip** per video.

**Why:** The two-layer rule is what makes "grounded, traceable, no-infringement"
real for footage, the visual analogue of the source-tiering discipline (ADR-005).
Minecraft is the safe, policy-clean, on-brand choice. File-drop ingestion keeps the
operator's prep to zero while respecting YouTube's ToS (no scraping/downloading) and
still recording per-clip provenance for the clearance manifest in
[operations.md](./operations.md).

---

## ADR-025 — Thumbnail: Remotion-composed, not AI (Phase 3)

**Decision:** Render the thumbnail **in Remotion** — a dynamic, high-contrast
gameplay frame plus the publish package's `thumbnailText` in the bold brand caption
style (optional logo badge). Not AI-generated. Keep a seam to swap in AI later if
data ever justifies it.

**Why:** For Shorts/Reels the thumbnail matters far less than for long-form — the
feed autoplays the *video*, so the thumbnail mainly serves the channel grid and
search, and the real swipe-stopper is the first 1–2 seconds. A Remotion-composed
still is free, consistent, on-brand, and editable, and is what strong faceless
channels ship; AI thumbnails add cost, inconsistency, and off-brand risk for little
gain. Judged by best practice and performance, not taste.

---

## ADR-026 — Content value & channel positioning (the reason to watch/subscribe)

**Decision:** The product is **information with a point of view**, not a voiceover
over gameplay. The first end-to-end render proved the pipeline but exposed that the
content had no reason to exist for a viewer. We commit to:
1. **Visual connection** — every clip *shows* what it talks about (ADR-027).
2. **Substance-first scripts** — one concrete, specific, source-named fact (ADR-028).
3. **A series with a promise** — lead with the launch **countdown** ("Countdown to
   the subject", one confirmed feature/day, on-screen "N DAYS LEFT"); the CTA states a
   reason to follow, not a ritual.
4. **Identity = trust + clarity** — "the subject channel that sources everything, no
   fake leaks"; the **CONFIRMED / RUMOR** confidence (ADR-005/015) becomes a visible
   on-screen badge.
5. **Lifecycle phases as Series (ADR-006)** — pre-launch countdown/features → launch
   coverage → **post-launch tips/secrets/guides** (the evergreen, decade-long goldmine).

Full detail: [content-strategy.md](./content-strategy.md).

**Why:** Technically-good but valueless videos are worse than none — the pipeline
would just scale something nobody watches. Viewers watch the subject content for concrete
info, hype/FOMO, and a trusted filter in a clickbait-heavy space; they subscribe
when a channel is a consistent *show* with a promise and an identity. These five
moves are what convert a commodity fact-reader into a channel worth following, and
the launch runway (2026-11-19) is the biggest lever we have.

---

## ADR-027 — Split layout + original graphics layer (amends ADR-023)

**Decision:** Replace the full-frame-gameplay + overlaid-captions layout with a
**split**:
1. **Top half = original, generated subject graphics** (zero copyright risk, within
   ADR-002): stylized maps, subject-vs-predecessor comparisons, stat callouts, feature
   cards, timelines, an on-screen **source citation**, the **CONFIRMED/RUMOR badge**,
   and the **countdown**. This is where per-fact motion (cuts/zooms) lives.
2. **Bottom half = the muted Minecraft retention strip** (ADR-024 footage).
3. Graphics are **Remotion templates driven by a structured visual spec** (ADR-028);
   programmatic data-driven graphics are Remotion's strength.
4. Legal visual sources stay within ADR-002: original graphics, **on-screen source
   citations** (screenshots of our own sourced articles), and licensed **Miami/Florida
   stock** for Vice-City ambiance. Relaxing ADR-002 (e.g. trailer stills under
   news/commentary) is a separate, risk-weighed decision, not assumed here.
5. **Engagement layer** on the top half: keyword-synced **b-roll images** (fetched +
   cached, Unsplash → Pixabay → keyless Openverse), **emoji stamps** (Twemoji), a
   **retention progress bar**, and **sound effects**. SFX are **real, free,
   commercially-usable sounds** (not synth) pinned to exact Creative-Commons sources
   in `apps/render/src/media/sfx.config.ts` and fetched/cached at render time, with a
   synthesized tone as fallback: a **whoosh on the first visual swap** and a **riser
   on the FOLLOW screen**, nothing in between, mixed low under the voice. Both current
   picks are CC0; any CC-BY credit is captured for the description (as with images).
   Music is deferred. All sounds are unrelated to the subject, consistent with ADR-002.

**Why:** The visual disconnect was the #1 reason the first clip had no value, and it
was a direct consequence of ADR-002. Original graphics *show* the fact, look more
premium and distinctive than everyone reusing the same trailer clips, and keep us
fully clear of copyright. The split gives the retention gameplay a place while making
the top half carry the actual information. Supersedes the overlay layout and caption
placement in ADR-023 (caption *style* — word-by-word, brand magenta — carries over).

---

## ADR-028 — Scripts carry a visual spec + substance-first copy

**Decision:**
1. **Substance first.** The scriptwriter leads with the concrete fact — the
   number/detail and the **named source** ("the rights-holder confirmed…") — before any
   personality. Rebalances the recent personality-heavy tuning that sanded off the
   information.
2. **Structured visual spec.** Generation emits, per script, a machine-readable spec
   of what the top half should show (e.g. `{ kind: "comparison", a, b, metric }`,
   `{ kind: "map", region }`, `{ kind: "stat", value, label }`, plus the source
   label, confidence badge, and countdown). The render maps each spec kind to a
   graphics template (ADR-027).
3. **Export-contract extension.** The visual spec rides in the publish package /
   `ScriptExport` (packages/shared), so render stays decoupled (ADR-009). Widen the
   contract deliberately, in sync with the Prisma schema and the render templates.

**Why:** The render can only *show* what it's told to show; the information already
exists as sourced claims in the ideation DB, so generation is the right place to
decide the visual and surface specificity + the source. Keeping it a structured spec
(not free-form) is what lets a fixed template library render it reliably, and keeping
it inside the export contract preserves the ideation↔render boundary.

---

## ADR-029 — Generation guarantees the value layer (mandatory visual + b-roll)

**Decision:**
1. **Mandatory, not optional.** The scriptwriter prompt marks the on-screen `visual`
   and `broll` (≥2 cues, each term appearing verbatim in the hook/body) as REQUIRED —
   a response missing either is declared invalid.
2. **Regenerate until rich.** `generateOne` re-asks the LLM up to **3×**, feeding the
   model its own prior reply plus a corrective nudge, until the parsed script carries
   both fields. The first usable parse is kept as a fallback so a stubborn fact still
   drafts rather than failing.
3. **Graceful floor.** A script that still lacks the full layer after the retries is
   drafted anyway (logged); the render's existing headline-from-thumbnailText fallback
   (ADR-028) covers a missing visual.

**Why:** ADR-028 put the on-screen value layer in generation's hands, but the free
Gemini tier emits those nested fields only intermittently (observed **0 of 14** in one
batch), so clips rendered plain (`images=0`) despite the renderer fully supporting
graphics + b-roll. Guaranteeing the fields at the source — a stricter prompt plus
bounded regeneration — makes the value layer reliable without touching the export
contract or the renderer. Retries stay bounded and the generate worker's existing
concurrency-1 + rate limiter keep Gemini free-tier usage in check. If the free tier
ever proves too inconsistent even with retries, the cheaper fix is a stronger model
tier (the provider interface already allows it, ADR-012) rather than more retries.

---

## ADR-030 — Phase 4 publishing is notification-assisted manual posting

**Decision:** For launch, Phase 4 publishes via the **platforms' own native
schedulers**, driven by a Telegram notification — **not** an automated API
poster. When a clip renders, the operator gets it on Telegram (video +
thumbnail + copy-paste metadata + its assigned slot), uploads it in YouTube
Studio and the Instagram app, and **schedules** it for its slot. The automated
YouTube Data API / Instagram Graph API poster is **deferred to Phase 5** on the
same queue. Full design: [phase-4-publish.md](./phase-4-publish.md).

**Why:** The API path's prerequisites don't fit the launch runway — YouTube
needs a Google Cloud OAuth app; Instagram's Content Publishing API needs a
Business account + Facebook Page + Meta app + a public video URL + (usually)
**Meta App Review** (days–weeks). Native scheduling needs only a free IG
**Professional** toggle and the existing YouTube channel, costs nothing, and
preserves both human gates (ADR-004) — it is exactly the "manual-phase
shortcut via native schedulers" the roadmap always named. **Native scheduling
(not live posting) is essential** because the operator's timezone differs from the
target market's and the prime slots fall in the operator's night; scheduling lets one comfortable evening batch publish
overnight.

---

## ADR-031 — Staged Gate-1 review: pending selections committed by one Render action

**Decision:** Reviewing no longer renders on each approve. The operator marks
drafts **approve/reject** as **pending** choices (new nullable
`Script.reviewSelection`), nothing changing until a single **Render** (commit)
action transitions them all: `APPROVE` → `APPROVED` + enqueue render, `REJECT` →
`REJECTED`, untouched → stay `DRAFT` (roll over). Approvals are **capped at the
series `dailyClips`** (default 2) minus clips already active for the day; the cap
is enforced in the dashboard and re-checked on commit.

**Why:** Lets the operator weigh the whole batch before committing, and renders
(the one metered step) only what's actually chosen. The cap keeps cadence steady
and spend bounded. This refines **ADR-021's** "approve auto-enqueues a render" —
the trigger (`APPROVED` → render) is unchanged; only its timing moves from
per-click to the batched commit.

---

## ADR-032 — Publish queue: PublishTask, slots, Human Gate 2

**Decision:** A finished render (`RenderJob` → `DONE`) creates a **`PublishTask`**
(`READY → NOTIFIED → SCHEDULED`, or `CANCELLED`) assigned the **next open slot**
(FIFO by render-finish) from per-series config (`timezone`, `slots`,
`dailyClips`, `postDays` in `config/publishing.ts`, ADR-006). **Gate 2** is the
operator scheduling (or not) that clip; the veto is Reject/Redo or simply not
scheduling. On `SCHEDULED`, the two `Post` rows (YouTube + Instagram) are created
for the ADR-020 loop; `Post.externalUrl` is optional. If no clip is ready at a
slot, the slot is skipped.

**Why:** A durable task with an explicit slot is what the notifier, reminders,
and (later) the Phase-5 API poster all consume — one queue, one Gate 2, whether
posting is manual or automated. Reusing `Post` for metrics keeps the ADR-020 loop
intact and shapes the data for Phase 5 with no rework (ADR-009 spirit).

---

## ADR-033 — Telegram is the Gate-2 channel; `Scheduled` reply confirms

**Decision:** Notifications and confirmations run over **Telegram** (bot token +
chat id in env, never logged — mirrors ADR-022's key handling). **Outbound:** on
`DONE`, send the video, thumbnail, slot time (ET/UK/IST), and copy-paste YouTube
+ Instagram blocks built from the `PublishPackage`. **Inbound:** a poller
(`getUpdates`, offset persisted in an `AppState` KV) matches a **reply to a
clip's message** carrying the keyword **`Scheduled`** (case-insensitive) → marks
that task `SCHEDULED` (both platforms) and advances the queue; the dashboard can
do the same. **Reminders** nudge for due/overdue unscheduled clips and **catch up
on startup** if the app was down (Telegram retains replies ~24h; beyond that the
operator confirms in the dashboard).

**Why:** Telegram is free, sends files + formatted text to the operator's phone,
and needs **no server to send and no hosting** — inbound is simple long-poll that
resumes from its stored offset whenever the stack runs, which fits the local,
on-demand deployment (ADR-016). WhatsApp would reintroduce the Business-API
approval burden Phase 4 exists to avoid.

---

## ADR-034 — Rendering is idempotent; ElevenLabs is the only metered call

**Decision:** `render.enqueue` returns the in-flight job if one exists **and
skips a script that already has a `DONE` render** unless `force` (the **Redo**
action) is set; BullMQ `jobId` keeps one job per attempt. **Redo** re-renders the
same script with a different background but **reuses the version-keyed cached
voiceover** (Phase 3), so it makes **no** new paid call unless the script text
changed. Committing Render only enqueues genuinely-new scripts; a clip the
operator is happy with is never re-rendered.

**Why:** ElevenLabs is the only metered/paid API in the pipeline (Gemini runs
only on Fetch; Telegram is free). Idempotent enqueue + the audio cache mean quota
is spent once per script and never by accident on re-clicks, swaps, or retries —
the operator's explicit "don't render anything unnecessarily" requirement.
