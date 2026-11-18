import { TtsProvider, TtsSynthesis } from './tts.interface';

/**
 * Manual voiceover seam (ADR-013/022): the operator supplies their own audio
 * when ElevenLabs credits run out or a human read is wanted. Not implemented yet
 * — word timings would need a sidecar (e.g. a forced-aligner), which is out of
 * scope for now. The seam exists so selecting it is a config change, not code.
 */
export class ManualTtsProvider implements TtsProvider {
  readonly cacheTag = 'manual';
  readonly voiceId = 'manual';

  synthesize(): Promise<TtsSynthesis> {
    return Promise.reject(
      new Error('manual TTS mode is a seam, not implemented yet (ADR-013/022)'),
    );
  }
}
