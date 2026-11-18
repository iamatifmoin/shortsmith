import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { FONT_HEAVY } from '../theme';

/**
 * The CTA beat (ADR-026/027): a bold FOLLOW hero that pops in while the CTA line
 * is spoken — a clear beat change from the data graphic, with a reason to follow.
 */
export const CtaHero: React.FC<{ daysUntilLaunch: number; accent: string; startSec: number }> = ({
  daysUntilLaunch,
  accent,
  startSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: Math.max(0, frame - startSec * fps),
    fps,
    config: { damping: 12, mass: 0.7 },
    durationInFrames: 18,
  });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, transform: `scale(${scale})` }}>
      <div
        style={{
          fontFamily: FONT_HEAVY,
          fontSize: 140,
          color: '#fff',
          textTransform: 'uppercase',
          WebkitTextStroke: `5px ${accent}`,
          paintOrder: 'stroke fill',
          textShadow: `0 0 55px ${accent}`,
        }}
      >
        Follow
      </div>
      <div style={{ fontFamily: FONT_HEAVY, fontSize: 46, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>
        a confirmed fact daily
      </div>
      {daysUntilLaunch > 0 && (
        <div
          style={{
            fontFamily: FONT_HEAVY,
            fontSize: 40,
            color: '#fff',
            background: accent,
            padding: '10px 28px',
            borderRadius: 999,
            textTransform: 'uppercase',
            boxShadow: `0 0 30px ${accent}99`,
          }}
        >
          {daysUntilLaunch} days to launch
        </div>
      )}
    </div>
  );
};
