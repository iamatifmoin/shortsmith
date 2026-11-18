import { NextResponse } from 'next/server';

import { getJson } from '@/lib/ideation';

/** GET /api/channel/connections — which integrations are configured (booleans only). */
export async function GET() {
  try {
    const data = await getJson('/channel/connections');
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the channel API' },
      { status: 502 },
    );
  }
}
