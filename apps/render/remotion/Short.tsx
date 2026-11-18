import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  random,
  Series,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { Captions } from './Captions';
import { COLOR, DIM, FONT_HEAVY, FONT_UI } from './theme';
import { TopBar } from './TopBar';
import { ShortProps } from './types';
import { AnimatedBackdrop } from './visuals/AnimatedBackdrop';
import { CtaHero } from './visuals/CtaHero';
import { ImageBeat } from './visuals/ImageBeat';
import { VisualGraphic } from './visuals/VisualGraphic';

/** One background clip for a cut: muted, cover-cropped, with a slow punch-in zoom. */
const BgClip: React.FC<{ src: string; width: number; height: number; cutFrames: number; seed: string }> = ({
  src,
  width,
  height,
  cutFrames,
  seed,
}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, cutFrames], [1.03, 1.12], { extrapolateRight: 'clamp' });
  const startFrom = Math.floor(random(seed) * 60);
  return (
    <OffthreadVideo
      src={staticFile(src)}
      muted
      startFrom={startFrom}
      style={{ width, height, objectFit: 'cover', transform: `scale(${zoom})` }}
    />
  );
};

/** Small animated kicker label above the graphic. */
const Kicker: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  return (
    <div
      style={{
        fontFamily: FONT_HEAVY,
        fontSize: 40,
        color: accent,
        textTransform: 'uppercase',
        letterSpacing: 2,
        textAlign: 'center',
        maxWidth: 940,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [-18, 0])}px)`,
        textShadow: `0 0 24px ${accent}66`,
      }}
    >
      {text}
    </div>
  );
};

/**
 * The Short composition (ADR-027): 50-50 SPLIT. Top zone = an animated backdrop +
 * subject graphic (with a kicker + idle float) that CHANGES to a FOLLOW beat while
 * the CTA is spoken; bottom zone = gameplay that cuts every `cutSeconds`. Karaoke
 * captions at center; source at the frame bottom. 1080x1920 9:16 @30fps.
 */
export const Short: React.FC<ShortProps> = ({
  backgroundSrcs,
  cutSeconds,
  audioSrc,
  words,
  accentColor,
  visual,
  kicker,
  source,
  confidence,
  daysUntilLaunch,
  imageBeats,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const t = useCurrentFrame() / fps;
  const durationSec = durationInFrames / fps;
  const bottomH = DIM.H - DIM.TOP_H;
  const cutFrames = Math.max(1, Math.round(cutSeconds * fps));
  const cuts = Math.max(1, Math.ceil(durationInFrames / cutFrames));

  // When the CTA line starts (from the word timings) -> swap to the FOLLOW beat.
  const ctaWords = words.filter((w) => w.section === 'cta');
  const ctaStart = ctaWords.length ? ctaWords[0].start : Infinity;
  const ctaBound = Number.isFinite(ctaStart) ? ctaStart : durationSec;

  // B-roll image beats: each shows from its term-time until the next beat / CTA.
  const sorted = [...imageBeats].sort((a, b) => a.startSec - b.startSec);
  const beats = sorted.map((b, i) => ({
    src: b.src,
    startSec: b.startSec,
    emoji: b.emoji,
    endSec: Math.min(i + 1 < sorted.length ? sorted[i + 1].startSec : durationSec, ctaBound),
  }));
  const firstImageStart = sorted.length ? sorted[0].startSec : Infinity;

  // Default graphic shows until the first image (or the CTA) takes over.
  const graphicEnd = Math.min(firstImageStart, ctaBound);
  const graphicOpacity = Number.isFinite(graphicEnd)
    ? interpolate(t, [graphicEnd - 0.3, graphicEnd], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const ctaOpacity = Number.isFinite(ctaStart)
    ? interpolate(t, [ctaStart, ctaStart + 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  const floatY = Math.sin(t * 1.2) * 8;

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.bg }}>
      {/* Top: animated backdrop + subject graphic / CTA beat + chrome */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: DIM.W,
          height: DIM.TOP_H,
          background: `radial-gradient(120% 90% at 50% 0%, ${COLOR.bgTopA}, ${COLOR.bgTopB})`,
          overflow: 'hidden',
        }}
      >
        <AnimatedBackdrop width={DIM.W} height={DIM.TOP_H} />

        {beats.map((b, i) => (
          <ImageBeat key={i} src={b.src} startSec={b.startSec} endSec={b.endSec} emoji={b.emoji} />
        ))}

        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '150px 60px 110px' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 26,
              opacity: graphicOpacity,
              transform: `translateY(${floatY}px)`,
            }}
          >
            {kicker ? <Kicker text={kicker} accent={accentColor} /> : null}
            <VisualGraphic spec={visual} accent={accentColor} />
          </div>
        </AbsoluteFill>

        {Number.isFinite(ctaStart) && (
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: ctaOpacity }}>
            <CtaHero daysUntilLaunch={daysUntilLaunch} accent={accentColor} startSec={ctaStart} />
          </AbsoluteFill>
        )}

        <TopBar daysUntilLaunch={daysUntilLaunch} confidence={confidence} accent={accentColor} />
      </div>

      {/* Bottom: gameplay with quick cuts */}
      <div style={{ position: 'absolute', top: DIM.TOP_H, left: 0, width: DIM.W, height: bottomH, overflow: 'hidden' }}>
        <Series>
          {Array.from({ length: cuts }).map((_, i) => (
            <Series.Sequence key={i} durationInFrames={cutFrames}>
              <BgClip
                src={backgroundSrcs[i % backgroundSrcs.length]}
                width={DIM.W}
                height={bottomH}
                cutFrames={cutFrames}
                seed={`bg-${i}`}
              />
            </Series.Sequence>
          ))}
        </Series>
      </div>

      <Audio src={staticFile(audioSrc)} />

      <Captions words={words} accent={accentColor} anchorY={DIM.H / 2} />

      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 46,
          fontFamily: FONT_UI,
          fontSize: 28,
          color: 'rgba(255,255,255,0.82)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          textShadow: '0 2px 10px rgba(0,0,0,0.95)',
        }}
      >
        Source: {source}
      </div>

      {/* Retention progress bar along the very top. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: 8,
          width: `${Math.min(100, (t / durationSec) * 100)}%`,
          background: accentColor,
          boxShadow: `0 0 12px ${accentColor}`,
        }}
      />
    </AbsoluteFill>
  );
};
