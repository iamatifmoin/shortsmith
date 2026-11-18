import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/channel/sources — add or update a source on the active channel. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forward('/channel/sources', 'POST', body);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ error: data?.message ?? `Channel API returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the channel API' },
      { status: 502 },
    );
  }
}
