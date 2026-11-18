import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from 'remotion';

import { ThumbnailProps } from './types';

/**
 * Composed thumbnail still (ADR-025) — built to be scroll-stopping, not plain:
 * a graded gameplay frame, the brand lockup (logo + wordmark), a trust pill,
 * a launch-countdown starburst, and the headline in the heavy outlined caption
 * style. Rendered via renderStill — cheap and consistent, no AI image gen. All
 * elements are props-driven so the pipeline and the preview tool share one look.
 */

const FONT = "'Arial Black', Impact, Haettenschweiler, sans-serif";
const MAGENTA = '#ff1e9c';

function confidencePill(confidence?: string): { label: string; bg: string; fg: string } | null {
  if (!confidence) return null;
  if (confidence === 'CONFIRMED') return { label: '✓ CONFIRMED', bg: 'rgba(8,48,26,0.85)', fg: '#2fe36b' };
  if (confidence === 'STRONG_RUMOR') return { label: '◆ STRONG RUMOR', bg: 'rgba(52,38,10,0.85)', fg: '#ffb020' };
  return { label: '? RUMOR', bg: 'rgba(52,38,10,0.85)', fg: '#ffb020' };
}

/** Points string for an n-pointed star centred at (cx,cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export const Thumbnail: React.FC<ThumbnailProps> = ({
  backgroundSrc,
  text,
  accentColor,
  confidence,
  daysUntilLaunch,
  logoSrc,
  wordmarkSrc,
}) => {
  const accent = accentColor || MAGENTA;
  const pill = confidencePill(confidence);
  const showDays = typeof daysUntilLaunch === 'number' && daysUntilLaunch > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#05050a' }}>
      {/* gameplay frame, pushed in a touch for punch */}
      <OffthreadVideo
        src={staticFile(backgroundSrc)}
        muted
        style={{ width: 1080, height: 1920, objectFit: 'cover', transform: 'scale(1.12)' }}
      />

      {/* colour grade: magenta glow up top + top/bottom darkening for text contrast */}
      <AbsoluteFill
        style={{ background: 'radial-gradient(120% 65% at 50% 16%, rgba(255,30,156,0.30), rgba(0,0,0,0) 60%)' }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.30) 58%, rgba(0,0,0,0.92) 100%)',
        }}
      />

      {/* brand frame */}
      <AbsoluteFill
        style={{ border: `10px solid ${accent}`, boxShadow: 'inset 0 0 70px rgba(255,30,156,0.35)' }}
      />

      {/* top lockup: icon + wordmark (left), trust pill (right) */}
      <div
        style={{
          position: 'absolute',
          top: 44,
          left: 50,
          right: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {logoSrc && (
            <Img src={staticFile(logoSrc)} style={{ width: 148, height: 148, filter: `drop-shadow(0 0 24px ${accent})` }} />
          )}
          {wordmarkSrc && (
            <Img
              src={staticFile(wordmarkSrc)}
              style={{ height: 76, objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.85))' }}
            />
          )}
        </div>
        {pill && (
          <div
            style={{
              background: pill.bg,
              color: pill.fg,
              border: `3px solid ${pill.fg}`,
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 38,
              padding: '10px 22px',
              borderRadius: 999,
              letterSpacing: 1,
              whiteSpace: 'nowrap',
              textShadow: '0 2px 6px rgba(0,0,0,0.6)',
            }}
          >
            {pill.label}
          </div>
        )}
      </div>

      {/* headline */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 70px 60px' }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 158,
            fontWeight: 900,
            color: '#fff',
            textTransform: 'uppercase',
            textAlign: 'center',
            lineHeight: 0.98,
            letterSpacing: 1,
            WebkitTextStroke: '16px #000',
            paintOrder: 'stroke fill',
            textShadow: `0 0 42px ${accent}, 0 14px 34px rgba(0,0,0,0.7)`,
          }}
        >
          {text}
        </div>
        <div
          style={{
            marginTop: 28,
            width: 340,
            height: 16,
            background: accent,
            borderRadius: 999,
            boxShadow: `0 0 32px ${accent}`,
          }}
        />
      </AbsoluteFill>

      {/* launch-countdown starburst, bottom-right */}
      {showDays && (
        <div style={{ position: 'absolute', right: 36, bottom: 120, width: 300, height: 300, transform: 'rotate(-10deg)' }}>
          <svg viewBox="0 0 100 100" width="300" height="300">
            <polygon points={starPoints(50, 50, 48, 33, 16)} fill={accent} stroke="#000" strokeWidth={3} />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontFamily: FONT,
              textShadow: '0 3px 8px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 0.9, WebkitTextStroke: '4px #000', paintOrder: 'stroke fill' }}>
              {daysUntilLaunch}
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 2 }}>DAYS LEFT</div>
          </div>
        </div>
      )}

      {/* bottom brand strip */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: accent }} />
    </AbsoluteFill>
  );
};
