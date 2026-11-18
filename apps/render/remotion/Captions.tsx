import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { DIM } from './theme';
import { CaptionWord } from './types';

const MAX_WORDS_PER_LINE = 4;
/** A gap this long (s) between words starts a new caption line (a pause). */
const PAUSE_BREAK = 0.5;

/** Keep only tokens that contain a letter/number — drops stray "—", "-", etc. */
function isWordy(s: string): boolean {
  return /[a-z0-9]/i.test(s);
}

/** Group words into short lines, breaking on length, section change, or a pause. */
function buildChunks(words: CaptionWord[]): CaptionWord[][] {
  const clean = words.filter((w) => isWordy(w.word));
  const chunks: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (let i = 0; i < clean.length; i++) {
    const w = clean[i];
    const prev = clean[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    const sectionChanged = Boolean(prev && prev.section !== w.section);
    if (cur.length && (cur.length >= MAX_WORDS_PER_LINE || sectionChanged || gap > PAUSE_BREAK)) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * Karaoke-style captions (ADR-023, revised): a short line of words is shown at the
 * vertical center, white, with the word currently being spoken highlighted in the
 * brand accent and given a small pop. Lines break on pauses and section changes;
 * punctuation-only tokens are dropped so pauses never show a stray dash.
 */
export const Captions: React.FC<{ words: CaptionWord[]; accent: string; anchorY: number }> = ({
  words,
  accent,
  anchorY,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const chunks = useMemo(() => buildChunks(words), [words]);

  let active = -1;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const start = c[0].start;
    const end = c[c.length - 1].end;
    const next = chunks[i + 1];
    const showUntil = next ? next[0].start : end + 0.4;
    if (t >= start && t < showUntil) {
      active = i;
      break;
    }
  }
  if (active < 0) return null;
  const chunk = chunks[active];

  return (
    <div
      style={{
        position: 'absolute',
        top: anchorY,
        left: 70,
        width: DIM.W - 140,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignContent: 'center',
        gap: '6px 22px',
        transform: 'translateY(-50%)',
      }}
    >
      {chunk.map((w, i) => {
        const next = chunk[i + 1];
        const isActive = t >= w.start && t < (next ? next.start : w.end + 0.3);
        const pop = isActive
          ? interpolate(t, [w.start, w.start + 0.08], [0.9, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;
        return (
          <span
            key={i}
            style={{
              fontFamily: "'Arial Black', Impact, Haettenschweiler, sans-serif",
              fontSize: 76,
              fontWeight: 900,
              textTransform: 'uppercase',
              lineHeight: 1.04,
              color: isActive ? accent : '#fff',
              WebkitTextStroke: '9px #000',
              paintOrder: 'stroke fill',
              textShadow: '0 6px 18px rgba(0,0,0,0.5)',
              transform: `scale(${pop})`,
              display: 'inline-block',
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
