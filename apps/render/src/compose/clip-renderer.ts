import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { Confidence, ScriptExport, VisualSpec } from '@shortsmith/shared';

import { EmojiService } from '../images/emoji.service';
import { ImageService } from '../images/image.service';
import { getSfx, mixSfx, synthImpact, synthWhoosh } from '../media/audio';
import { SFX_PICKS } from '../media/sfx.config';
import { SectionWord } from '../tts/tts.interface';
import { TtsService } from '../tts/tts.service';
import { pickClips } from './background';
import { RemotionService } from './remotion.service';

export interface ClipRendererOptions {
  /** assets/ root (backgrounds live under here). */
  assetsDir: string;
  /** Where outputs are written. */
  outDir: string;
  /** Seconds each background clip shows before cutting. */
  cutSeconds: number;
  /** Background pool (subfolder under backgrounds/), e.g. "minecraft". */
  game: string;
  /** System Chrome path; else Remotion downloads its own headless browser. */
  browserExecutable?: string;
}

export interface RenderedClip {
  videoPath: string;
  thumbnailPath: string;
  durationSec: number;
  voiceId: string;
  /** Background clip filenames used (for the RenderJob / ADR-020 loop). */
  backgroundClips: string[];
}

const LAUNCH_ISO = '2026-11-19T00:00:00Z';

/**
 * Renders one APPROVED script (the export contract) into a finished clip +
 * thumbnail: voiceover -> pick background clips -> Remotion compose. The single
 * place the pipeline and the CLI both call. Visual/source/confidence are taken
 * from the script when present and derived with sensible fallbacks until the
 * generation stage fills them (ADR-028).
 */
export class ClipRenderer {
  constructor(
    private readonly tts: TtsService,
    private readonly remotion: RemotionService,
    private readonly images: ImageService,
    private readonly emoji: EmojiService,
    private readonly opts: ClipRendererOptions,
  ) {}

  async render(script: ScriptExport, outName: string): Promise<RenderedClip> {
    await fs.mkdir(this.opts.outDir, { recursive: true });

    const t0 = Date.now();
    const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    const step = (m: string) => console.error(`[render] ${ms()} ${m}`);

    step('tts: synthesizing…');
    const vo = await this.tts.synthesizeScript(script);
    step(`tts ok (${vo.durationSec.toFixed(1)}s, ${vo.words.length} words)`);

    const cutCount = Math.max(1, Math.ceil(vo.durationSec / this.opts.cutSeconds));
    const clips = await pickClips(this.opts.assetsDir, this.opts.game, cutCount);
    step(`clips ok (${clips.length})`);

    // B-roll: fetch an image per cue and time it to when its term is spoken (ADR-027).
    // Weak matches (no term in the transcript, or no image) are simply skipped.
    const imageBeats: { localPath: string; startSec: number; emojiLocalPath?: string }[] = [];
    for (const cue of script.publish?.broll ?? []) {
      const startSec = findTermStart(vo.words, cue.term);
      if (startSec == null) continue;
      step(`image: fetching "${cue.query}"…`);
      const localPath = await this.images.get(cue.query);
      if (!localPath) continue;
      const emojiLocalPath = cue.emoji ? ((await this.emoji.get(cue.emoji)) ?? undefined) : undefined;
      imageBeats.push({ localPath, startSec, emojiLocalPath });
    }
    imageBeats.sort((a, b) => a.startSec - b.startSec);
    step(`images ok (${imageBeats.length})`);

    // SFX: ONE whoosh on the first visual swap, and a distinct impact on the FOLLOW
    // beat — nothing in between. Falls back to the plain voiceover if synth/mix fails.
    const ctaStart = vo.words.find((w) => w.section === 'cta')?.start;
    const firstBeat = imageBeats[0];
    const audioPath = join(this.opts.outDir, `${outName}.audio.mp3`);
    const sfxDir = join(this.opts.assetsDir, 'sfx');
    try {
      const whoosh = await getSfx('whoosh', SFX_PICKS.whoosh, sfxDir, synthWhoosh);
      const accent = await getSfx('accent', SFX_PICKS.accent, sfxDir, synthImpact);
      for (const c of [whoosh.credit, accent.credit].filter(Boolean)) step(`sfx credit: ${c}`);
      await mixSfx(
        vo.audioPath,
        [
          ...(firstBeat ? [{ path: whoosh.path, atSec: firstBeat.startSec, gain: 0.7 }] : []),
          ...(ctaStart != null ? [{ path: accent.path, atSec: ctaStart, gain: 0.8 }] : []),
        ],
        audioPath,
      );
    } catch {
      await fs.copyFile(vo.audioPath, audioPath);
    }
    step('sfx ok → compose (bundle + render)…');

    const videoPath = join(this.opts.outDir, `${outName}.mp4`);
    const thumbnailPath = join(this.opts.outDir, `${outName}.jpg`);

    // Transient OffthreadVideo/ffmpeg hiccups happen; one retry.
    await withRetry(() =>
      this.remotion.compose({
        backgroundClips: clips,
        cutSeconds: this.opts.cutSeconds,
        audioPath,
        words: vo.words,
        durationSec: vo.durationSec,
        visual: visualFor(script),
        source: sourceFor(script),
        confidence: script.confidence ?? Confidence.CONFIRMED,
        daysUntilLaunch: daysUntilLaunch(),
        imageBeats,
        thumbnailText: thumbnailTextFor(script),
        outputVideo: videoPath,
        outputThumb: thumbnailPath,
        logoPath: join(this.opts.assetsDir, 'brand', 'icon.png'),
        wordmarkPath: join(this.opts.assetsDir, 'brand', 'wordmark.png'),
        browserExecutable: this.opts.browserExecutable,
      }),
    );

    return {
      videoPath,
      thumbnailPath,
      durationSec: vo.durationSec,
      voiceId: vo.voiceId,
      backgroundClips: clips.map((c) => basename(c)),
    };
  }
}

/** When (seconds) a term is first spoken, from the word timings; null if absent. */
function findTermStart(words: SectionWord[], term: string): number | null {
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const parts = term.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  for (let i = 0; i + parts.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) {
      if (norm(words[i + j].word) !== parts[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return words[i].start;
  }
  // Fallback: first word of the term alone.
  const first = words.find((w) => norm(w.word) === parts[0]);
  return first ? first.start : null;
}

// --- Fallback derivations (until the generation stage fills these, ADR-028) ---

function visualFor(s: ScriptExport): VisualSpec {
  return s.publish?.visual ?? { kind: 'headline', text: (s.publish?.thumbnailText ?? s.hook).toUpperCase() };
}

function sourceFor(s: ScriptExport): string {
  if (s.publish?.source) return s.publish.source;
  const url = s.claims[0]?.sourceUrl;
  if (!url) return 'Confirmed';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Confirmed';
  }
}

function thumbnailTextFor(s: ScriptExport): string {
  return (s.publish?.thumbnailText ?? s.hook).toUpperCase();
}

function daysUntilLaunch(): number {
  return Math.max(0, Math.ceil((new Date(LAUNCH_ISO).getTime() - Date.now()) / 86_400_000));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
