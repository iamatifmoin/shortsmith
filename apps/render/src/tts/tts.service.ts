import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ScriptExport } from '@shortsmith/shared';

import { probeDurationSec } from '../media/ffmpeg';
import {
  ScriptSection,
  SectionWord,
  TtsProvider,
  Voiceover,
  VoiceoverSection,
} from './tts.interface';

export interface TtsServiceOptions {
  /** Where cached voiceovers live (keyed by content). */
  cacheDir: string;
}

/**
 * Turns an APPROVED script into one voiceover track (ADR-022). Hook / body / cta
 * are synthesized in a SINGLE request (joined by newlines) so the audio is one
 * seamless piece — separate per-section requests stitched with silence left an
 * audible ambient-floor "cut" at each join. Section boundaries are recovered from
 * the word timings (words mapped to sections by per-section word count). Cached by
 * content, so an unchanged script never re-spends ElevenLabs credits.
 */
export class TtsService {
  constructor(
    private readonly provider: TtsProvider,
    private readonly opts: TtsServiceOptions,
  ) {}

  async synthesizeScript(script: ScriptExport): Promise<Voiceover> {
    const parts = (
      [
        { section: 'hook', text: script.hook },
        { section: 'body', text: script.body },
        { section: 'cta', text: script.cta },
      ] as { section: ScriptSection; text: string }[]
    )
      .map((p) => ({ section: p.section, text: normalize(p.text) }))
      .filter((p) => p.text.length > 0);
    if (parts.length === 0) throw new Error('synthesizeScript: script has no spoken text');

    // One request for the whole script -> continuous ambient, natural pauses at
    // the newline section breaks.
    const combined = parts.map((p) => p.text).join('\n');

    const key = cacheKey(this.provider.cacheTag, combined);
    const audioPath = join(this.opts.cacheDir, `${key}.mp3`);
    const metaPath = join(this.opts.cacheDir, `${key}.json`);
    await fs.mkdir(this.opts.cacheDir, { recursive: true });

    const cached = await readCache(metaPath, audioPath);
    if (cached) return { ...cached, audioPath };

    const { audio, words } = await this.provider.synthesize(combined);
    await fs.writeFile(audioPath, audio);
    const durationSec = await probeDurationSec(audioPath);

    // Map words to sections by per-section word count; the last section absorbs
    // any remainder so a tokenization drift can't drop words.
    const counts = parts.map((p) => p.text.split(' ').length);
    const sectionWords: SectionWord[] = [];
    const sections: VoiceoverSection[] = [];
    let i = 0;
    parts.forEach((p, pi) => {
      const end = pi === parts.length - 1 ? words.length : i + counts[pi];
      const slice = words.slice(i, end);
      for (const w of slice) sectionWords.push({ ...w, section: p.section });
      if (slice.length) {
        sections.push({ section: p.section, start: slice[0].start, end: slice[slice.length - 1].end });
      }
      i = end;
    });

    const meta = { durationSec, voiceId: this.provider.voiceId, words: sectionWords, sections };
    await fs.writeFile(metaPath, JSON.stringify(meta));
    return { audioPath, ...meta };
  }
}

/** Collapse whitespace so word counts are stable across the join. */
function normalize(text: string): string {
  return (text ?? '').trim().replace(/\s+/g, ' ');
}

/** Content-addressed cache key — any change to text / voice re-voices. */
function cacheKey(tag: string, combined: string): string {
  return createHash('sha256').update(`${tag}\u0000${combined}`).digest('hex').slice(0, 32);
}

async function readCache(
  metaPath: string,
  audioPath: string,
): Promise<Omit<Voiceover, 'audioPath'> | null> {
  try {
    await fs.access(audioPath);
    return JSON.parse(await fs.readFile(metaPath, 'utf8')) as Omit<Voiceover, 'audioPath'>;
  } catch {
    return null;
  }
}
