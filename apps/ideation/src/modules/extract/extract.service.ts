import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmProvider, ManualInterventionRequired } from '@shortsmith/llm';

import { PrismaService } from '../../prisma/prisma.service';
import { LLM_PROVIDER } from '../../llm/llm.module';
import { HarvestedPage } from '../harvest/harvest.service';
import { buildExtractMessages, buildExtractSystem, parseClaims, snippetMatches } from './prompts';

/** An atomic claim pulled from a page, with full source traceability. */
export interface ExtractedClaim {
  claim: string;
  sourceUrl: string;
  snippet: string;
  sourceTier: number;
  /** false when the snippet wasn't found verbatim in the source (ADR-015 flag). */
  snippetVerified: boolean;
}

const MAX_INPUT_CHARS = 12_000;
const MAX_CLAIMS = 10;

/**
 * STAGE 2 — extract. An LLM pulls ATOMIC factual claims from a harvested page,
 * each with a verbatim snippet + sourceUrl + sourceTier (per-claim traceability,
 * ADR-005). Facts are persisted unclustered (rank assigns FactUnits later).
 * A snippet not found verbatim is flagged, never dropped (ADR-015).
 * See docs/architecture.md#2-extract.
 */
@Injectable()
export class ExtractService {
  private readonly logger = new Logger(ExtractService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /** Extract atomic claims from one harvested page and persist them as Fact rows. */
  async extract(page: HarvestedPage, seriesId: string): Promise<ExtractedClaim[]> {
    const text = page.content.slice(0, MAX_INPUT_CHARS);
    const series = await this.prisma.series.findUniqueOrThrow({ where: { id: seriesId } });
    const system = buildExtractSystem(series.subjectName, series.subjectAliases);

    let raw: string;
    try {
      const res = await this.llm.complete(buildExtractMessages(text), {
        system,
        temperature: 0,
        maxTokens: 2048,
      });
      raw = res.text;
    } catch (err) {
      if (err instanceof ManualInterventionRequired) {
        // Manual mode: can't answer synchronously. Park the doc for the operator.
        this.logger.warn(`extract(${page.url}): manual LLM step required — parked`);
        await this.markError(page.sourceDocumentId, 'manual LLM step required');
        return [];
      }
      throw err; // capacity-exhausted / genuine errors bubble up for BullMQ retry
    }

    const claims = parseClaims(raw).slice(0, MAX_CLAIMS);

    // Re-extract cleanly: drop any prior facts for this document first.
    if (page.sourceDocumentId) {
      await this.prisma.fact.deleteMany({ where: { sourceDocumentId: page.sourceDocumentId } });
    }

    const out: ExtractedClaim[] = [];
    for (const c of claims) {
      const snippetVerified = snippetMatches(c.snippet, page.content);
      await this.prisma.fact.create({
        data: {
          claim: c.claim,
          snippet: c.snippet,
          sourceUrl: page.url,
          sourceTier: page.sourceTier,
          sourceDocumentId: page.sourceDocumentId,
          snippetVerified,
        },
      });
      out.push({
        claim: c.claim,
        sourceUrl: page.url,
        snippet: c.snippet,
        sourceTier: page.sourceTier,
        snippetVerified,
      });
    }

    if (page.sourceDocumentId) {
      await this.prisma.sourceDocument.update({
        where: { id: page.sourceDocumentId },
        data: { extractedAt: new Date(), error: null },
      });
    }

    const unverified = out.filter((c) => !c.snippetVerified).length;
    this.logger.log(
      `extract(${page.url}): ${out.length} fact(s)` +
        (unverified ? `, ${unverified} with unverified snippet` : ''),
    );
    return out;
  }

  private async markError(sourceDocumentId: string | undefined, message: string): Promise<void> {
    if (!sourceDocumentId) return;
    await this.prisma.sourceDocument
      .update({ where: { id: sourceDocumentId }, data: { error: message } })
      .catch(() => undefined);
  }
}
