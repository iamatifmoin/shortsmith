import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { COLOR, FONT_HEAVY } from '../theme';
import { BarItem } from '../types';

/** Two-bar comparison of the subject vs another on a metric. First item = our subject. */
export const Comparison: React.FC<{ title: string; a: BarItem; b: BarItem; unit?: string; accent: string }> = ({
  title,
  a,
  b,
  unit,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(a.value, b.value, 1);
  const grow = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 22 });
  const widthOf = (v: number) => interpolate(grow, [0, 1], [0, (v / max) * 760]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34, alignItems: 'center', width: 920 }}>
      <div style={{ fontFamily: FONT_HEAVY, fontSize: 48, color: '#fff', textTransform: 'uppercase', textAlign: 'center' }}>
        {title}
      </div>
      {[a, b].map((item, i) => (
        <div key={i} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: FONT_HEAVY, fontSize: 44, color: '#fff' }}>{item.label}</span>
            <span style={{ fontFamily: FONT_HEAVY, fontSize: 44, color: i === 0 ? accent : COLOR.dim }}>
              {item.value}
              {unit ?? ''}
            </span>
          </div>
          <div style={{ height: 58, borderRadius: 16, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: widthOf(item.value),
                background: i === 0 ? accent : 'rgba(255,255,255,0.35)',
                borderRadius: 16,
                boxShadow: i === 0 ? `0 0 40px ${accent}aa` : 'none',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
