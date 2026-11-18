import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

import { COLOR } from '../theme';

/**
 * Continuous background motion for the top zone (ADR-027): drifting glow blobs +
 * floating accent dots, so the top half is never static. Deterministic (pure
 * function of frame), so renders are reproducible.
 */
export const AnimatedBackdrop: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const blob = (seed: number, color: string, size: number, key: string) => {
    const x = width * (0.5 + 0.36 * Math.sin(t * 0.4 + seed));
    const y = height * (0.45 + 0.3 * Math.cos(t * 0.33 + seed * 1.7));
    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}, transparent 70%)`,
          filter: 'blur(36px)',
          opacity: 0.45,
        }}
      />
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {blob(0, COLOR.magenta, 540, 'b0')}
      {blob(2.1, '#7a1fff', 480, 'b1')}
      {blob(4.0, COLOR.magenta, 380, 'b2')}
      {Array.from({ length: 8 }).map((_, i) => {
        const x = width * ((i * 0.137 + 0.08 + 0.03 * Math.sin(t * 0.8 + i)) % 1);
        const y = height * ((i * 0.231 + 0.12 + 0.04 * Math.cos(t * 0.7 + i)) % 1);
        return (
          <div
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: COLOR.magenta,
              opacity: 0.5,
              boxShadow: `0 0 12px ${COLOR.magenta}`,
            }}
          />
        );
      })}
    </div>
  );
};
