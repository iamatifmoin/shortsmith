import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/harvest/run — trigger a pipeline run (the "Fetch new scripts" button). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forward('/harvest/run', 'POST', body);
    const detail = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: detail?.message ?? `Ideation API returned ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(detail ?? { ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the ideation API' },
      { status: 502 },
    );
  }
}
