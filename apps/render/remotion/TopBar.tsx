import React from 'react';

import { confidenceStyle, FONT_HEAVY } from './theme';

/**
 * Top content-zone chrome (ADR-026/027): launch countdown (left) + confidence
 * badge (right) — the urgency + trust signals. The source citation lives at the
 * frame bottom (in Short) so it never collides with the centered captions.
 */
export const TopBar: React.FC<{
  daysUntilLaunch: number;
  confidence: string;
  accent: string;
}> = ({ daysUntilLaunch, confidence, accent }) => {
  const c = confidenceStyle(confidence);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 44,
          left: 44,
          right: 44,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {daysUntilLaunch > 0 ? (
          <div
            style={{
              fontFamily: FONT_HEAVY,
              fontSize: 36,
              color: '#fff',
              background: accent,
              padding: '12px 28px',
              borderRadius: 999,
              textTransform: 'uppercase',
              boxShadow: `0 0 30px ${accent}99`,
            }}
          >
            {daysUntilLaunch} days left
          </div>
        ) : (
          <div />
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: `4px solid ${c.color}`,
            padding: '8px 22px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: 999, background: c.color }} />
          <span style={{ fontFamily: FONT_HEAVY, fontSize: 30, color: c.color, textTransform: 'uppercase' }}>
            {c.label}
          </span>
        </div>
      </div>
    </>
  );
};
