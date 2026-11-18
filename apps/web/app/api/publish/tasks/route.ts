import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/** GET /api/publish/tasks — clips awaiting / past Gate 2, proxied from ideation. */
export async function GET() {
  try {
    return NextResponse.json(await getJson('/publish/tasks'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the publish API' },
      { status: 502 },
    );
  }
}
