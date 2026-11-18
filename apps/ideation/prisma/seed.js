// Prisma seed. Creates a NEUTRAL EXAMPLE channel so the template is testable out
// of the box; the setup wizard replaces it with the operator's real channel.
// Run with:
//   pnpm --filter @shortsmith/ideation db:seed   (or it runs after `prisma migrate dev`)
// Idempotent: upserts the series by `key` and its sources by (series, key).
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

// If the operator keeps a local, git-ignored seed (their real channel config),
// run that instead of the neutral example — so an existing channel is preserved
// without ever committing it to the repo. See .gitignore (local preservation).
const localSeed = path.join(__dirname, 'seed.local.js');
if (fs.existsSync(localSeed)) {
  require(localSeed);
  return;
}

const prisma = new PrismaClient();

const KEY = 'example';

/** The channel persona for the scriptwriter prompt (niche config, not code). */
const PERSONALITY =
  'Confident, upbeat, and clued-in — a knowledgeable friend who always has the real info first. ' +
  'Attitude and the occasional bold take, but never over the top. PG-13 and advertiser-friendly.';

/** Format rules mirror docs/shorts-spec.md guardrails. */
const FORMAT_RULES = {
  lengthSec: [20, 45],
  hardCapSec: 60,
  // Recency (ADR-019): skip facts whose newest source is older than maxFactAgeDays
  // in generate; flag "outdated" in review past staleFlagDays.
  maxFactAgeDays: 120,
  staleFlagDays: 45,
  structure: {
    hook: '0–3s punchy one-liner, big on-screen text — the retention driver',
    body: 'the fact + its payoff as a tight mini-arc, ~165 wpm, grounded only in sources',
    cta: 'a clear, varied, on-brand invite to follow — never a fixed template',
  },
  banned: ['explicit content', 'crude anatomy', 'demeaning jokes', 'punching down'],
};

/**
 * Brand defaults for the Gate-1 publish package (ADR-018). Footer + disclosure +
 * default tags are applied deterministically in code (never AI-generated). The
 * wizard fills these with the operator's real branding.
 */
const PUBLISH_DEFAULTS = {
  handle: '@example',
  descriptionFooter:
    'An independent channel. Not affiliated with, endorsed by, or sponsored by any brand mentioned.',
  defaultTags: [],
  aiDisclosure: 'Voiceover is AI-generated.',
  emoji: false,
  maxHashtags: 5,
  maxTags: 15,
};

/** Publishing cadence (Phase 4). The wizard replaces these with the channel's markets. */
const PUBLISH_CONFIG = {
  timezone: 'America/New_York',
  slots: ['12:00', '19:00', '15:00'],
  dailyClips: 2,
  postDays: [0, 1, 2, 3, 4, 5, 6],
  displayZones: { 'US (ET)': 'America/New_York', UK: 'Europe/London' },
  operatorTimezone: 'UTC',
  briefingTime: '09:00',
  reminderTime: '21:00',
};

/** A couple of real Tier-2 sources so harvest produces something to review. */
const SOURCES = [
  {
    key: 'the-verge',
    name: 'The Verge',
    tier: 2,
    url: 'https://www.theverge.com/',
    rssUrl: 'https://www.theverge.com/rss/index.xml',
  },
  {
    key: 'ars-technica',
    name: 'Ars Technica',
    tier: 2,
    url: 'https://arstechnica.com/',
    rssUrl: 'https://feeds.arstechnica.com/arstechnica/index',
  },
];

const CHANNEL = {
  name: 'Example Channel',
  description: 'A neutral example channel. Replace it with your own via the setup wizard.',
  displayName: 'Example Channel',
  subjectName: 'artificial intelligence',
  subjectAliases: ['AI', 'machine learning'],
  topicTerms: ['artificial intelligence', 'AI', 'machine learning', 'LLM', 'chatbot'],
  comparisonLabel: 'AI',
  personality: PERSONALITY,
  voiceTone: null,
  formatRules: FORMAT_RULES,
  publishDefaults: PUBLISH_DEFAULTS,
  publishConfig: PUBLISH_CONFIG,
  // Tier-2 press + the open-web (Tier-4) fallback; STRONG_RUMOR so a fresh channel
  // produces drafts before heavy corroboration exists (tune per channel).
  minConfidence: 'STRONG_RUMOR',
  allowedTiers: [2, 4],
  active: true,
};

async function main() {
  const series = await prisma.series.upsert({
    where: { key: KEY },
    update: { ...CHANNEL },
    create: { key: KEY, ...CHANNEL },
  });

  for (const s of SOURCES) {
    await prisma.source.upsert({
      where: { seriesId_key: { seriesId: series.id, key: s.key } },
      update: { name: s.name, tier: s.tier, url: s.url, rssUrl: s.rssUrl ?? null, rumorOnly: s.tier >= 3, active: true },
      create: {
        seriesId: series.id,
        key: s.key,
        name: s.name,
        tier: s.tier,
        url: s.url,
        rssUrl: s.rssUrl ?? null,
        rumorOnly: s.tier >= 3,
      },
    });
  }

  console.log(`Seeded example series "${series.key}" (${series.id}) with ${SOURCES.length} source(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
