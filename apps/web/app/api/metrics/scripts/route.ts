import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/** GET /api/metrics/scripts — approved scripts + their recorded posts. */
export async function GET() {
  try {
    return NextResponse.json(await getJson('/metrics/scripts'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the metrics API' },
      { status: 502 },
    );
  }
}
