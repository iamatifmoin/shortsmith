import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { FONT_HEAVY } from '../theme';

/** Fallback graphic: a big kinetic headline when no structured visual fits. */
export const Headline: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 16 });

  return (
    <div
      style={{
        fontFamily: FONT_HEAVY,
        fontSize: 88,
        color: '#fff',
        textTransform: 'uppercase',
        textAlign: 'center',
        maxWidth: 960,
        lineHeight: 1.03,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [30, 0])}px)`,
      }}
    >
      {text}
    </div>
  );
};
