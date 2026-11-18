import React from 'react';
import { Composition } from 'remotion';

import { Short } from './Short';
import { Thumbnail } from './Thumbnail';
import { ShortProps, ThumbnailProps } from './types';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

const DEFAULT_SHORT: ShortProps = {
  backgroundSrcs: ['bg0.mp4'],
  cutSeconds: 2.5,
  audioSrc: 'vo.mp3',
  words: [],
  durationSec: 20,
  captionColor: '#ffffff',
  accentColor: '#ff1e9c',
  visual: { kind: 'comparison', title: 'Camera', a: { label: 'New phone', value: 200 }, b: { label: 'Old model', value: 100 }, unit: 'MP' },
  kicker: 'A 200-megapixel camera, double the old model',
  source: 'Launch Event',
  confidence: 'CONFIRMED',
  daysUntilLaunch: 15,
  imageBeats: [],
};

const DEFAULT_THUMB: ThumbnailProps = {
  backgroundSrc: 'bg.mp4',
  text: '200MP CAMERA',
  accentColor: '#ff1e9c',
  confidence: 'CONFIRMED',
  daysUntilLaunch: 10,
  logoSrc: 'logo.png',
  wordmarkSrc: 'wordmark.png',
};

/** Registers the render compositions. Duration comes from the voiceover length. */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Short"
        component={Short}
        durationInFrames={Math.round(DEFAULT_SHORT.durationSec * FPS)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={DEFAULT_SHORT}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, Math.round((props.durationSec || 20) * FPS)),
        })}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        durationInFrames={90}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={DEFAULT_THUMB}
      />
    </>
  );
};
