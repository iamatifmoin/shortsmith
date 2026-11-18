import { SlotTimes } from '@shortsmith/shared';

import { PublishConfig } from '../../config/publishing';

/**
 * Dependency-free timezone + slot math (Phase 4). We avoid pulling in luxon /
 * date-fns-tz: `Intl.DateTimeFormat` gives us a tz's wall-clock parts at any
 * instant, which is enough to (a) place a "HH:mm in tz" slot on the UTC timeline
 * and (b) format an instant for the operator's zones.
 */

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock parts of a UTC instant, as seen in `tz`. */
function partsInZone(date: Date, tz: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

/** How far `tz` is from UTC (ms, positive east) at the given instant. */
function offsetMs(utcMs: number, tz: string): number {
  const p = partsInZone(new Date(utcMs), tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // The formatter has no seconds here; align to the minute to avoid drift.
  return asIfUtc - Math.floor(utcMs / 60000) * 60000;
}

/** The UTC instant for a wall-clock time (y/m/d hh:mm) in `tz`. DST-safe. */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = offsetMs(guess, tz);
  let utc = guess - off1;
  const off2 = offsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2; // re-correct across a DST boundary
  return new Date(utc);
}

/** Weekday (0=Sun..6=Sat) of the calendar date `date` falls on in `tz`. */
function weekdayInZone(date: Date, tz: string): number {
  const p = partsInZone(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** Format an instant as e.g. "Mon 12:00 PM" in `tz`. */
function formatInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Tracking label for a slot: which clip of the day it is (1-based, by slot order)
 * and a short posting date, both in the target timezone — e.g. { clipNo: 1,
 * dateLabel: "Nov 7" } so the operator can track "Clip 1 · Nov 7".
 */
export function slotMeta(iso: string, cfg: PublishConfig): { clipNo: number; dateLabel: string } {
  const date = new Date(iso);
  const { hour, minute } = partsInZone(date, cfg.timezone);
  const hhmm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const norm = (s: string) => {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
  };
  const idx = cfg.slots.findIndex((s) => norm(s) === hhmm);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.timezone,
    month: 'short',
    day: 'numeric',
  }).format(date);
  return { clipNo: idx >= 0 ? idx + 1 : 1, dateLabel };
}

/** Calendar date of an instant in a zone, as "YYYY-MM-DD" (for day grouping). */
export function zoneDateKey(date: Date, tz: string): string {
  const p = partsInZone(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Wall-clock "HH:mm" of an instant in a zone (for time-of-day gates). */
export function zoneHhmm(date: Date, tz: string): string {
  const p = partsInZone(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Short, friendly date of an instant in a zone, e.g. "Nov 8". */
export function zoneDateLabel(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(date);
}

/** The calendar day before a "YYYY-MM-DD" key (pure date math, zone-independent). */
export function prevDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** A slot instant rendered across the config's display zones (for notify/UX). */
export function slotTimes(iso: string, cfg: PublishConfig): SlotTimes {
  const date = new Date(iso);
  const byZone: Record<string, string> = {};
  for (const [label, tz] of Object.entries(cfg.displayZones)) {
    byZone[label] = formatInZone(date, tz);
  }
  return { iso, byZone };
}

/**
 * The next open slot at or after `now`, given the slots already taken (UTC ms of
 * non-cancelled tasks' slotAt). Fills up to `dailyClips` of the configured slot
 * times per allowed day, skipping taken slots and any slot within LEAD_MS of now.
 */
export function nextOpenSlot(cfg: PublishConfig, takenMs: Set<number>, now = new Date()): Date {
  const LEAD_MS = 15 * 60 * 1000; // don't assign a slot essentially "now"
  const perDay = Math.min(cfg.dailyClips, cfg.slots.length);
  for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (!cfg.postDays.includes(weekdayInZone(probe, cfg.timezone))) continue;
    const { year, month, day } = partsInZone(probe, cfg.timezone);
    for (let i = 0; i < perDay; i++) {
      const [hh, mm] = cfg.slots[i].split(':').map(Number);
      const instant = zonedWallClockToUtc(year, month, day, hh, mm, cfg.timezone);
      if (instant.getTime() < now.getTime() + LEAD_MS) continue; // past / too soon
      if (takenMs.has(instant.getTime())) continue; // already filled
      return instant;
    }
  }
  // Fallback (should never hit in 90 days): one hour out.
  return new Date(now.getTime() + 60 * 60 * 1000);
}
