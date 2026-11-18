import { CopyBlocks, PublishPackage, SlotTimes } from '@shortsmith/shared';

/**
 * Builds the ready-to-paste YouTube + Instagram upload text (Phase 4, ADR-033)
 * from the Gate-1 publish package (ADR-018). Pure/deterministic: no I/O. The
 * operator copies these into YouTube Studio / the Instagram app and schedules the
 * clip for its slot — so each block ends with a settings checklist that names the
 * slot time in the right zone (YouTube schedules in ET, the operator in IST).
 */

/** Brand-level defaults read from Series.publishDefaults (ADR-018). */
export interface PublishDefaults {
  /** Standing disclaimer appended to descriptions, e.g. "Not affiliated with the rights-holder." */
  disclaimer?: string;
  /** Standing footer line (channel tagline / subscribe nudge). */
  footer?: string;
  /** Default hashtags/tags merged in if the package is sparse. */
  defaultTags?: string[];
}

function ensureShortsTag(description: string): string {
  return /#shorts\b/i.test(description) ? description : `${description.trim()}\n\n#Shorts`;
}

function withDisclaimer(description: string, defaults: PublishDefaults, sourceUrl?: string): string {
  const extra: string[] = [];
  if (sourceUrl) extra.push(`Source: ${sourceUrl}`);
  if (defaults.disclaimer && !description.includes(defaults.disclaimer)) extra.push(defaults.disclaimer);
  return extra.length ? `${description.trim()}\n\n${extra.join('\n')}` : description.trim();
}

export interface CopyInput {
  hook: string;
  cta: string;
  /** The Gate-1 package (may be absent on older scripts — we fall back to hook/cta). */
  publish?: PublishPackage | null;
  defaults: PublishDefaults;
  slot: SlotTimes;
  /** Primary source URL for the "Source:" line (from the first claim). */
  sourceUrl?: string;
}

/** The slot time string for a given display-zone label, or the ISO as a fallback. */
function at(slot: SlotTimes, label: string): string {
  return slot.byZone[label] ?? new Date(slot.iso).toISOString();
}

/** Build the per-platform copy-paste blocks. */
export function buildCopyBlocks(input: CopyInput): CopyBlocks {
  const { publish, defaults, slot, sourceUrl } = input;

  const title = (publish?.title ?? input.hook).slice(0, 100);
  const baseDescription =
    publish?.description ??
    [input.hook, '', input.cta, '', (publish?.hashtags ?? []).join(' ')].join('\n').trim();
  const description = ensureShortsTag(withDisclaimer(baseDescription, defaults, sourceUrl));
  const tags = (publish?.tags?.length ? publish.tags : defaults.defaultTags ?? []).slice(0, 40);

  // No #Shorts on Instagram — it's a YouTube-only tag and does nothing on Reels.
  const igCaption = withDisclaimer(publish?.igCaption ?? baseDescription, defaults, sourceUrl);

  return {
    youtube: {
      title,
      description,
      tags,
      settings: [
        'Create → Upload video → select the attached .mp4 (it is a vertical Short)',
        'Paste the Title and Description above; add the Tags under "Show more"',
        'Altered/synthetic content → Yes (our voiceover is AI) — Details → "Altered content". No reach/revenue penalty.',
        'Audience → "No, it\'s not made for kids"',
        'Category (Show more) → Gaming',
        'Thumbnail (attached .png): desktop Studio only, and needs YouTube Partner Program — if there is no upload option yet, pick the clearest auto-frame for now',
        'Location: skip (optional, no effect on Shorts reach)',
        `Visibility → Schedule → ${at(slot, 'US (ET)')}  (that's ${at(slot, 'You (IST)')} your time)`,
      ],
    },
    instagram: {
      caption: igCaption,
      settings: [
        'New Reel → upload the attached .mp4',
        'Paste the caption above',
        'Cover → pick the frame matching the attached thumbnail',
        'Advanced settings → Label AI-generated content → On (our voiceover is AI)',
        'Location: skip (optional, no effect on Reels reach)',
        'Share to Feed → on',
        `Advanced settings → Schedule → ${at(slot, 'You (IST)')} your time  (= ${at(slot, 'US (ET)')} ET) — needs a Professional (Business/Creator) account, or schedule from Meta Business Suite → Planner`,
      ],
    },
  };
}
