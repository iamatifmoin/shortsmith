import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/** GET /api/review/capacity — remaining approval capacity per active series (ADR-031). */
export async function GET() {
  try {
    return NextResponse.json(await getJson('/review/capacity'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
