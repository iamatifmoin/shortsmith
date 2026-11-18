# Sources & Confidence Rules

The harvest stage scrapes a **ranked whitelist only** — never the open web
(ADR-005), unless you opt into the Tier-4 fallback. The whitelist is the set of
**`Source` rows you add in the setup wizard** (per-channel data, ADR-006); this
document is the human-readable reference and rationale for how to tier them.

## Tiered whitelist

### Tier 1 — Canonical / confirmed
Official, first-party sources. A single Tier-1 source is enough to mark a fact
`CONFIRMED`.

- The subject's official site / newsroom / newswire
- First-party press releases, earnings calls, investor materials
- The subject's official YouTube or social channels

### Tier 2 — Reputable press
Established journalism and trade press that cover your niche. Two independent
Tier-2 sources corroborate to `CONFIRMED`; one alone is `STRONG_RUMOR`.

- Major news outlets for the subject's field
- Reputable trade/industry publications
- Well-known specialist blogs with an editorial standard

### Tier 3 — Community / aggregators (RUMOR-flagged only)
Useful for spotting emerging stories, but **always** flagged `RUMOR`. Never
sufficient on their own for anything above `RUMOR`.

- Relevant subreddits
- Niche forums and fan communities
- Aggregators and insider/leak accounts

### Tier 4 — Open web (RUMOR-flagged only, operator-judged)
Beyond the whitelist, the harvester may **search the open web** for emerging
stories (ADR-014). Tier-4 results are the **lowest trust**, **always flagged
`RUMOR`**, and never auto-trusted — the operator judges them at Gate 1. Unlike
Tiers 1–3 this is not a fixed list of URLs; it's a web search, so every hit
carries its source URL + snippet for traceability like any other claim.

## Confidence & corroboration rules

Applied in the **rank** stage when clustering `Fact`s into a `FactUnit`.

| Confidence      | Rule |
|-----------------|------|
| `CONFIRMED`     | Any **Tier-1** source **OR** **≥2 independent Tier-2** sources. |
| `STRONG_RUMOR`  | Exactly **1 Tier-2** source. |
| `RUMOR`         | **Tier-3 or open web (Tier-4)** only. |

- **Independent** means distinct outlets, not syndications/reposts of one
  original. Corroboration count (`FactUnit.corroborationCount`) counts
  independent facts.
- `FactUnit.isRumor` is `true` for anything below `CONFIRMED`.
- A `FactUnit` can be **flagged out** (`flaggedOut = true`) when the operator
  rejects a script for a bad underlying fact. Flagged-out units are excluded
  from future generation.

## How confidence gates generation

The pre-launch series **"example"** is **confirmed-only**
(`Series.minConfidence = CONFIRMED`, `allowedTiers = [1, 2]`). The generate
stage only draws from `FactUnit`s meeting the series' `minConfidence` and whose
facts come from the series' `allowedTiers`. So Tier-3/Tier-4 rumor is harvested
and visible but **never generates a script** for `"example"` — it only
would for a rumor-tolerant series that opts into those tiers, purely by
configuration, no code change (ADR-006).
