# Operations

Channel-level and operational decisions for running the channel. **Visual
branding — logo, color palette, fonts, the exact voice — is operator-owned.** The
channel's name, handle, branding, sources and cadence are set in the **`/setup`
wizard**, not hardcoded.

## Channel

- **Name / handle:** set in the setup wizard (and reserve the handle on every
  platform).
- **Platforms:** YouTube Shorts + Instagram Reels only. No TikTok. The Instagram
  account should be a **Business** account linked to a **Facebook Page** — required
  for the later Instagram Graph API publishing.

## Audience & cadence

- **Audience target:** pick the markets your subject plays best in. Shorts ad
  revenue pools by **viewer country**, so aim content and posting slots at your
  target market's afternoon/evening. Set the timezone + slots in the wizard.
- **Cadence:** 2–3 Shorts/day at fixed slots, drawn **FIFO** from the buffer of
  approved scripts. See the publishing pipeline in
  [architecture.md](./architecture.md).
- Treat slot times as a starting guess; move them using the channel's
  peak-viewer analytics after ~a week.

## Compliance (non-negotiable)

- **Unofficial / independent channel.** Put a disclaimer in the channel + video
  descriptions (set it in the wizard's branding footer): "Not affiliated with,
  endorsed by, or associated with [the rights-holder of your subject]." Never use
  the subject's logos, title treatment, or official key art.
- **Audience setting:** mark the channel and every video **"not made for kids"**
  unless your subject genuinely targets children. Getting this wrong disables
  comments and hurts reach.
- **AI disclosure:** the voiceover is synthetic — enable YouTube's
  **altered/synthetic content** disclosure. Safer to disclose than not.

## Per-clip clearance checklist

Before a clip is posted, confirm:
- [ ] Background footage is **cleared** (e.g. Minecraft — Mojang permits monetized
      gameplay video) or operator-owned. No ripped streamer footage.
- [ ] Background audio **muted**.
- [ ] Music from the **YouTube Audio Library** (Content-ID-cleared).
- [ ] **Zero** copyrighted assets / logos / title treatment of the subject.
- [ ] AI (synthetic-content) disclosure set.

## Metrics to log (manual-learning phase)

Per clip, record: hook type, angle, primary fact, background used, post time,
views, average view duration / retention %, likes, subscribers gained. This
dataset is what tells you "what hits" and later tunes hook scoring + angle
selection in the generator.
