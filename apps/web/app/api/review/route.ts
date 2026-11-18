import { NextResponse } from 'next/server';

import { getQueue } from '@/lib/ideation';

/** GET /api/review — the live review queue, proxied from the ideation API. */
export async function GET() {
  try {
    const items = await getQueue();
    return NextResponse.json(items);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
