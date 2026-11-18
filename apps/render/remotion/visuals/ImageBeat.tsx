import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * A b-roll image shown as the top-zone main element during [startSec, endSec]
 * (ADR-027): ken-burns zoom, cross-fade at the edges, a dark gradient for
 * legibility, and an optional emoji stamp that pops in.
 */
export const ImageBeat: React.FC<{ src: string; startSec: number; endSec: number; emoji?: string }> = ({
  src,
  startSec,
  endSec,
  emoji,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const fadeIn = interpolate(t, [startSec, startSec + 0.25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(t, [endSec - 0.25, endSec], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);
  if (opacity <= 0) return null;

  const prog = (t - startSec) / Math.max(0.1, endSec - startSec);
  const zoom = interpolate(prog, [0, 1], [1.06, 1.16]);
  const emojiPop = spring({
    frame: Math.max(0, frame - startSec * fps),
    fps,
    config: { damping: 11, mass: 0.6 },
    durationInFrames: 16,
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,18,0.6) 0%, rgba(10,10,18,0.1) 28%, rgba(10,10,18,0.25) 100%)',
        }}
      />
      {emoji ? (
        <div
          style={{
            position: 'absolute',
            bottom: 34,
            right: 44,
            transform: `scale(${interpolate(emojiPop, [0, 1], [0.4, 1])})`,
            filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.55))',
          }}
        >
          <Img src={staticFile(emoji)} style={{ width: 150, height: 150 }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
