/**
 * TTS provider interface (Phase 3, ADR-022). Mirrors the packages/llm pattern:
 * the renderer reaches text-to-speech only through this seam, so ElevenLabs, a
 * manual fallback, or a future provider swap without touching callers.
 */

/** Which part of the script a word belongs to (drives hook treatment, ADR-023). */
export type ScriptSection = 'hook' | 'body' | 'cta';

/** One word and its timing, in seconds from the start of its audio. */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/** Raw synthesis of one block of text. */
export interface TtsSynthesis {
  /** mp3 audio bytes. */
  audio: Buffer;
  /** Per-word timings relative to this audio's start. */
  words: WordTiming[];
}

/** A provider turns text into speech with word-level timings. */
export interface TtsProvider {
  /** Identifies provider + voice + model, for cache keys. */
  readonly cacheTag: string;
  /** Voice identifier, recorded on the RenderJob. */
  readonly voiceId: string;
  synthesize(text: string): Promise<TtsSynthesis>;
}

/** A word on the final (concatenated) voiceover timeline, tagged by section. */
export interface SectionWord extends WordTiming {
  section: ScriptSection;
}

/** Where each section sits on the final voiceover timeline (seconds). */
export interface VoiceoverSection {
  section: ScriptSection;
  start: number;
  end: number;
}

/** The finished voiceover for a script: one audio file + word/section timings. */
export interface Voiceover {
  audioPath: string;
  durationSec: number;
  voiceId: string;
  words: SectionWord[];
  sections: VoiceoverSection[];
}

/** Nest DI token for the selected TtsProvider. */
export const TTS_PROVIDER = Symbol('TTS_PROVIDER');
