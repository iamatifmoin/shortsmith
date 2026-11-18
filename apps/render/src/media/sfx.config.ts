/**
 * The channel's chosen SFX, pinned to exact Creative-Commons sources (ADR-027).
 * Media isn't committed (assets/** is gitignored), so each role is fetched from
 * its pinned URL at render time and cached locally — a fresh clone reproduces the
 * same sounds, and provenance lives in assets/sfx/LICENSES.md. Both current picks
 * are CC0 (no attribution owed); swap a role here to change the sound everywhere.
 */
export interface SfxPick {
  /** Direct URL to the audio file. */
  url: string;
  /** Source/landing page (provenance). */
  sourceUrl: string;
  /** License label. */
  license: string;
  /** Attribution for the video description; '' for CC0/PDM. */
  attribution: string;
  /** Human label. */
  title: string;
}

export const SFX_PICKS: Record<'whoosh' | 'accent', SfxPick> = {
  // Plays on the first visual swap (the map appearing).
  whoosh: {
    url: 'https://cdn.freesound.org/previews/60/60007_71257-hq.mp3',
    sourceUrl: 'https://freesound.org/people/qubodup/sounds/60007',
    license: 'cc0 1.0',
    attribution: '',
    title: 'Swipe Whoosh',
  },
  // Plays on the FOLLOW screen — a riser that lifts into the call to action.
  accent: {
    url: 'https://cdn.freesound.org/previews/614/614152_1130120-hq.mp3',
    sourceUrl: 'https://freesound.org/people/videofueralle/sounds/614152',
    license: 'cc0 1.0',
    attribution: '',
    title: 'Swishes 12 (riser)',
  },
};
