/** Shared visual constants for the compositions (ADR-027). */

export const DIM = {
  W: 1080,
  H: 1920,
  FPS: 30,
  /** Height of the top content/graphics zone; 50-50 split with the gameplay strip. */
  TOP_H: 960,
} as const;

export const COLOR = {
  bg: '#0a0a12',
  bgTopA: '#170b1e',
  bgTopB: '#0a0a12',
  magenta: '#ff1e9c',
  white: '#ffffff',
  dim: 'rgba(255,255,255,0.72)',
  /** Trust signals — green = confirmed, amber = rumor. */
  confirmed: '#2fe36b',
  rumor: '#ffb020',
} as const;

export const FONT_HEAVY = "'Arial Black', Impact, Haettenschweiler, sans-serif";
export const FONT_UI = "'Arial Narrow', 'Arial', sans-serif";

export function confidenceStyle(confidence: string): { label: string; color: string } {
  if (confidence === 'CONFIRMED') return { label: 'CONFIRMED', color: COLOR.confirmed };
  if (confidence === 'STRONG_RUMOR') return { label: 'STRONG RUMOR', color: COLOR.rumor };
  return { label: 'RUMOR', color: COLOR.rumor };
}
