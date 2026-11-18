/**
 * Plain-language labels for the review dashboard.
 *
 * The pipeline uses short internal codes (flag slugs, enum values, tier
 * numbers). The operator should never have to decode those, so everything the
 * screen shows is written in simple, self-explanatory language here, in one
 * place. If a code has no entry, we fall back to showing the raw value.
 */

/** Non-blocking review warnings (ADR-015). Each is a plain sentence + tone. */
export const FLAG_LABELS: Record<string, { text: string; tone: 'warn' | 'info' }> = {
  'snippet-unverified': {
    text: 'The exact quote was not found word-for-word in the source',
    tone: 'warn',
  },
  uncorroborated: {
    text: 'Only one source backs this up',
    tone: 'info',
  },
  'below-confirmed': {
    text: 'Not fully confirmed — treat as a rumor',
    tone: 'warn',
  },
  'rumor-tier-source': {
    text: 'Comes from a community / rumor source, not an official one',
    tone: 'warn',
  },
  outdated: {
    text: 'The source may be out of date and newer info could exist',
    tone: 'warn',
  },
};

export function flagLabel(slug: string): { text: string; tone: 'warn' | 'info' } {
  return FLAG_LABELS[slug] ?? { text: slug, tone: 'info' };
}

/** How confident we are in a fact. */
export const CONFIDENCE_LABELS: Record<string, { text: string; tone: 'good' | 'mid' | 'low' }> = {
  CONFIRMED: { text: 'Confirmed', tone: 'good' },
  STRONG_RUMOR: { text: 'Strong rumor', tone: 'mid' },
  RUMOR: { text: 'Rumor', tone: 'low' },
};

export function confidenceLabel(value: string | null): { text: string; tone: 'good' | 'mid' | 'low' } {
  if (!value) return { text: 'Unknown', tone: 'low' };
  return CONFIDENCE_LABELS[value] ?? { text: value, tone: 'low' };
}

/** What kind of source a claim came from, by trust tier. */
export const SOURCE_TIER_LABELS: Record<number, string> = {
  1: 'Official source',
  2: 'News source',
  3: 'Community / rumor source',
  4: 'Open web',
};

export function sourceTierLabel(tier: number | null): string {
  if (tier == null) return 'Unknown source';
  return SOURCE_TIER_LABELS[tier] ?? `Tier ${tier} source`;
}

/** The kind of take the script takes on its fact. */
export const ANGLE_TYPE_LABELS: Record<string, string> = {
  FACT: 'Single fact',
  LIST: 'List',
  EXPLAINER: 'Explainer',
  COMPARISON: 'Comparison',
  PREDICTION: 'Prediction',
};

export function angleTypeLabel(value: string): string {
  return ANGLE_TYPE_LABELS[value] ?? value;
}

/** Where a clip was posted. */
export const PLATFORM_LABELS: Record<string, string> = {
  YOUTUBE: 'YouTube Shorts',
  INSTAGRAM: 'Instagram Reels',
};

export function platformLabel(value: string): string {
  return PLATFORM_LABELS[value] ?? value;
}
