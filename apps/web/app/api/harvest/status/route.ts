import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/**
 * GET /api/harvest/status — pipeline busy state for the "Fetching…" loader.
 * On any error we report idle so the loader stops rather than spinning forever;
 * the client's retry/cap logic handles a flaky poll.
 */
export async function GET() {
  try {
    const data = await getJson('/harvest/status');
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { busy: false, byStage: {}, error: err instanceof Error ? err.message : 'status unavailable' },
      { status: 200 },
    );
  }
}
