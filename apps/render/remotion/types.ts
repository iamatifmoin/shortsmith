/** Prop types shared by the Remotion compositions (ADR-023/027/028). */

export type ScriptSection = 'hook' | 'body' | 'cta';

/** One word on the voiceover timeline (seconds), from the TTS word timings. */
export interface CaptionWord {
  word: string;
  start: number;
  end: number;
  section: ScriptSection;
}

export type Confidence = 'CONFIRMED' | 'STRONG_RUMOR' | 'RUMOR';

/** One item in a comparison (e.g. a game and its metric value). */
export interface BarItem {
  label: string;
  value: number;
}

/**
 * What the top half should show (ADR-028). A small, closed set of kinds, each
 * mapped to a graphics template — so a fixed library can render it reliably.
 */
export type VisualSpec =
  | { kind: 'comparison'; title: string; a: BarItem; b: BarItem; unit?: string }
  | { kind: 'stat'; value: string; label: string }
  | { kind: 'headline'; text: string };

/** Input props for the "Short" composition. Assets are staticFile() names. */
export type ShortProps = {
  /** Background clips to cut between (bg0.mp4, bg1.mp4, …) — ADR-027 quick cuts. */
  backgroundSrcs: string[];
  /** Seconds each background clip shows before cutting to the next. */
  cutSeconds: number;
  audioSrc: string;
  words: CaptionWord[];
  durationSec: number;
  captionColor: string;
  accentColor: string;
  /** The top-half subject graphic (ADR-027/028). */
  visual: VisualSpec;
  /** Small kicker label above the graphic (the thumbnail tease). */
  kicker: string;
  /** On-screen source citation, e.g. the outlet or announcement name. */
  source: string;
  /** Confidence badge (ADR-005/015). */
  confidence: Confidence;
  /** Launch countdown; <= 0 hides it. */
  daysUntilLaunch: number;
  /** B-roll images (staticFile names) + optional emoji + when each appears (seconds). */
  imageBeats: { src: string; startSec: number; emoji?: string }[];
};

/** Input props for the "Thumbnail" still. */
export type ThumbnailProps = {
  backgroundSrc: string;
  text: string;
  accentColor: string;
  visual?: VisualSpec;
  /** Trust pill on the thumbnail (ADR-005/015). */
  confidence?: Confidence;
  /** Launch-countdown burst; <= 0 or undefined hides it. */
  daysUntilLaunch?: number;
  /** Brand icon + wordmark staticFile names (staged into the render bundle). */
  logoSrc?: string;
  wordmarkSrc?: string;
};
