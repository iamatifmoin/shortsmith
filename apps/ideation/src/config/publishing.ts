/**
 * Per-series publishing config (Phase 4, ADR-032). Series/niche stays
 * configuration, not code (ADR-006): the real cadence lives on Series.publishConfig
 * (set by the setup wizard); this file only holds the shape + a neutral fallback.
 * Secrets (Telegram bot token / chat id) live in env only (ADR-033), never here.
 */

/** Publishing cadence + slot config for one series. */
export interface PublishConfig {
  /** IANA timezone the slot wall-clock times are expressed in (the target market). */
  timezone: string;
  /** Daily slot times as "HH:mm" in {@link timezone}. Clips fill these in order. */
  slots: string[];
  /** Max clips to publish per day (<= slots.length used per day). The Gate-1 cap. */
  dailyClips: number;
  /** Days of week (0=Sun..6=Sat, in {@link timezone}) posting is allowed. */
  postDays: number[];
  /**
   * Extra zones to show alongside the slot in notifications, so the IST operator
   * sees their own local time. label -> IANA timezone.
   */
  displayZones: Record<string, string>;
  /** The operator's own timezone — drives the daily briefing / reminder timing + streak. */
  operatorTimezone: string;
  /** "HH:mm" in {@link operatorTimezone}: when the "fresh slate" briefing fires. */
  briefingTime: string;
  /** "HH:mm" in {@link operatorTimezone}: when to nudge if clips are still unscheduled. */
  reminderTime: string;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Neutral fallback config, used when a channel hasn't set its own cadence yet. The
 * real per-channel values live on Series.publishConfig (set by the setup wizard);
 * this is only the floor. Defaults to US-prime Shorts slots in an operator's UTC
 * day — the wizard replaces timezone/slots/zones with the channel's own markets.
 */
export const DEFAULT_PUBLISH_CONFIG: PublishConfig = {
  timezone: 'America/New_York',
  // Order = fill order. At dailyClips: 2 the day's clips land on the first two.
  slots: ['12:00', '19:00', '15:00'],
  dailyClips: 2,
  postDays: ALL_DAYS,
  displayZones: {
    'US (ET)': 'America/New_York',
    'UK': 'Europe/London',
  },
  operatorTimezone: 'UTC',
  briefingTime: '09:00', // "fresh slate" nudge at the start of the operator's day
  reminderTime: '21:00', // evening-batch nudge if clips are still unscheduled
};

/**
 * Resolve a channel's publish config: its stored per-series override (Series.
 * publishConfig JSON) merged over the neutral default. Null/garbage falls back
 * cleanly, so a half-filled channel still works.
 */
export function publishConfigFor(stored?: unknown): PublishConfig {
  const override =
    stored && typeof stored === 'object' && !Array.isArray(stored)
      ? (stored as Partial<PublishConfig>)
      : {};
  return { ...DEFAULT_PUBLISH_CONFIG, ...override };
}
