import { TtsProvider, TtsSynthesis, WordTiming } from './tts.interface';

/** Expression controls (ADR-022). Lower stability + some style = livelier, less robotic. */
export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.4,
  similarity_boost: 0.8,
  style: 0.35,
  use_speaker_boost: true,
};

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  /** e.g. eleven_turbo_v2_5 (natural, same cost as flash) or eleven_flash_v2_5. */
  modelId: string;
  /** ElevenLabs output format. Default mp3_44100_128. */
  outputFormat?: string;
  /** Expression settings; defaults tuned to sound less robotic. */
  voiceSettings?: Partial<VoiceSettings>;
}

/** Character-level alignment returned by the with-timestamps endpoint. */
interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface WithTimestampsResponse {
  audio_base64: string;
  alignment: Alignment;
  normalized_alignment?: Alignment;
}

/**
 * ElevenLabs TTS via the `/with-timestamps` endpoint (ADR-022): one request
 * returns both the audio and character-level timings, which we fold into word
 * timings — no separate forced-aligner needed. Uses fetch directly (no vendor
 * SDK), so the dependency stays behind the TtsProvider seam.
 */
export class ElevenLabsProvider implements TtsProvider {
  readonly voiceId: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly outputFormat: string;
  private readonly voiceSettings: VoiceSettings;

  constructor(opts: ElevenLabsOptions) {
    this.apiKey = opts.apiKey;
    this.voiceId = opts.voiceId;
    this.modelId = opts.modelId;
    this.outputFormat = opts.outputFormat ?? 'mp3_44100_128';
    this.voiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...opts.voiceSettings };
  }

  get cacheTag(): string {
    const s = this.voiceSettings;
    return `elevenlabs:${this.modelId}:${this.voiceId}:${this.outputFormat}:${s.stability}-${s.similarity_boost}-${s.style}-${s.use_speaker_boost}`;
  }

  async synthesize(text: string): Promise<TtsSynthesis> {
    if (!this.apiKey) throw new Error('ElevenLabs: ELEVENLABS_API_KEY is not set');
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}` +
      `/with-timestamps?output_format=${encodeURIComponent(this.outputFormat)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ text, model_id: this.modelId, voice_settings: this.voiceSettings }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as WithTimestampsResponse;
    if (!data.audio_base64) throw new Error('ElevenLabs: response had no audio');
    return {
      audio: Buffer.from(data.audio_base64, 'base64'),
      words: alignmentToWords(data.alignment),
    };
  }
}

/** Fold per-character alignment into per-word timings (split on whitespace). */
function alignmentToWords(a: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  if (!a?.characters?.length) return words;

  let word = '';
  let start = -1;
  let end = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (/\s/.test(ch)) {
      if (word) {
        words.push({ word, start, end });
        word = '';
        start = -1;
      }
      continue;
    }
    if (start < 0) start = a.character_start_times_seconds[i];
    word += ch;
    end = a.character_end_times_seconds[i];
  }
  if (word) words.push({ word, start, end });
  return words;
}
