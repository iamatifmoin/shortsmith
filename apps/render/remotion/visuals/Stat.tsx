import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { FONT_HEAVY } from '../theme';

/** A single big number/stat with a label, e.g. "2X" / "BIGGER THAN BEFORE". */
export const Stat: React.FC<{ value: string; label: string; accent: string }> = ({ value, label, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, mass: 0.6 }, durationInFrames: 20 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          fontFamily: FONT_HEAVY,
          fontSize: 320,
          lineHeight: 1,
          color: accent,
          transform: `scale(${interpolate(s, [0, 1], [0.6, 1])})`,
          textShadow: `0 0 70px ${accent}aa`,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: FONT_HEAVY,
          fontSize: 60,
          color: '#fff',
          textTransform: 'uppercase',
          textAlign: 'center',
          maxWidth: 900,
          lineHeight: 1.04,
        }}
      >
        {label}
      </div>
    </div>
  );
};
