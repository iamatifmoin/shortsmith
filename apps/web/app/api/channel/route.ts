import { NextResponse } from 'next/server';

import { forward, getJson } from '@/lib/ideation';

/** GET /api/channel — the active channel config (or null if none set up yet). */
export async function GET() {
  try {
    const data = await getJson('/channel');
    return NextResponse.json(data ?? null);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the channel API' },
      { status: 502 },
    );
  }
}

/** PUT /api/channel — create or update the active channel config. */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forward('/channel', 'PUT', body);
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
