import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/** GET /api/metrics/insights — aggregated performance insights. */
export async function GET() {
  try {
    return NextResponse.json(await getJson('/metrics/insights'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the metrics API' },
      { status: 502 },
    );
  }
}
