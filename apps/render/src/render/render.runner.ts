import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RenderJobData, RenderStatus } from '@shortsmith/shared';

import { ClipRenderer } from '../compose/clip-renderer';
import { RemotionService } from '../compose/remotion.service';
import { EmojiService } from '../images/emoji.service';
import { ImageService } from '../images/image.service';
import { createImageProvider } from '../images/provider.factory';
import { IdeationClient } from '../ideation/ideation.client';
import { TtsService } from '../tts/tts.service';

/**
 * Renders one APPROVED script into a finished clip (ADR-021): fetch the export
 * contract, voice + compose via ClipRenderer, and report status back to ideation.
 * Never throws — failures are reported, not thrown.
 */
@Injectable()
export class RenderRunner {
  private readonly logger = new Logger(RenderRunner.name);
  private readonly renderer: ClipRenderer;

  constructor(
    private readonly ideation: IdeationClient,
    tts: TtsService,
    remotion: RemotionService,
    config: ConfigService,
  ) {
    const assetsDir = resolve(config.get<string>('ASSETS_DIR') ?? './assets');
    const images = new ImageService(createImageProvider(), join(assetsDir, 'images'));
    const emoji = new EmojiService(join(assetsDir, 'emoji'));
    this.renderer = new ClipRenderer(tts, remotion, images, emoji, {
      assetsDir,
      outDir: resolve(config.get<string>('OUTPUT_DIR') ?? './out'),
      cutSeconds: Number(config.get<string>('CUT_SECONDS') ?? 2.5),
      game: config.get<string>('BACKGROUND_GAME') ?? 'minecraft',
      browserExecutable: config.get<string>('REMOTION_CHROME') || undefined,
    });
  }

  async run(data: RenderJobData): Promise<void> {
    const { scriptId, renderJobId } = data;
    try {
      const script = await this.ideation.getExport(scriptId);
      await this.ideation.updateStatus(renderJobId, { status: RenderStatus.RENDERING });
      if (await this.cancelled(renderJobId)) return;

      const out = await this.renderer.render(script, `render-${renderJobId}`);
      if (await this.cancelled(renderJobId)) return;

      await this.ideation.updateStatus(renderJobId, {
        status: RenderStatus.DONE,
        videoPath: out.videoPath,
        thumbnailPath: out.thumbnailPath,
        durationSec: out.durationSec,
        audioDurationSec: out.durationSec,
        voiceId: out.voiceId,
        backgroundClips: out.backgroundClips,
      });
      this.logger.log(`render ${renderJobId} done -> ${out.videoPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`render job ${renderJobId} failed: ${message}`);
      if (!(await this.cancelled(renderJobId))) {
        await this.ideation.updateStatus(renderJobId, {
          status: RenderStatus.FAILED,
          error: message,
        });
      }
    }
  }

  /** True if the operator cancelled this job (polled between heavy steps). */
  private async cancelled(renderJobId: string): Promise<boolean> {
    const job = await this.ideation.getJob(renderJobId);
    if (job?.status === RenderStatus.CANCELLED) {
      this.logger.log(`render job ${renderJobId} cancelled — aborting`);
      return true;
    }
    return false;
  }
}
