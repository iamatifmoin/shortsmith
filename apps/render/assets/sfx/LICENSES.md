# SFX provenance

Sound effects are **not committed** (binary media is gitignored); they are fetched
at render time from the pinned sources below and cached locally as `<role>.wav`.
The pins live in `apps/render/src/media/sfx.config.ts`. Both current picks are
**CC0 1.0** (public domain — no attribution required). If a role is ever changed
to a CC-BY (or similar) sound, record its required credit here and the renderer
will also surface it for the video description.

| Role   | Title            | Source                                               | License | Credit |
|--------|------------------|------------------------------------------------------|---------|--------|
| whoosh | Swipe Whoosh     | https://freesound.org/people/qubodup/sounds/60007    | CC0 1.0 | none   |
| accent | Swishes 12 (riser) | https://freesound.org/people/videofueralle/sounds/614152 | CC0 1.0 | none   |

Sourced via the Openverse audio API (which indexes Freesound's Creative-Commons
library). Downloads are trimmed to ~3s, loudness-normalized, and peak-limited
before use.
