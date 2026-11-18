import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RenderJobView, RenderStatusUpdate, ScriptExport } from '@shortsmith/shared';

/**
 * HTTP client to the ideation service. This is the ONLY way render talks to
 * ideation (ADR-021): it fetches the export contract and reports render status
 * back, never touching ideation internals or the database directly.
 */
@Injectable()
export class IdeationClient {
  private readonly logger = new Logger(IdeationClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('IDEATION_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  /** The APPROVED script as the export contract (packages/shared ScriptExport). */
  getExport(scriptId: string): Promise<ScriptExport> {
    return this.getJson<ScriptExport>(`/review/${scriptId}/export`);
  }

  /** The RenderJob row (used to poll for operator cancellation). */
  async getJob(renderJobId: string): Promise<RenderJobView | null> {
    try {
      return await this.getJson<RenderJobView>(`/render/jobs/${renderJobId}`);
    } catch (err) {
      this.logger.warn(`getJob(${renderJobId}) failed: ${String(err)}`);
      return null;
    }
  }

  /** Report a status transition back to ideation (the RenderJob owner). */
  async updateStatus(renderJobId: string, update: RenderStatusUpdate): Promise<void> {
    await this.postJson(`/render/jobs/${renderJobId}/status`, update);
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  }
}
