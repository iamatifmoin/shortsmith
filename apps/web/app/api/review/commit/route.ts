import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/review/commit — commit all staged choices (the Render button, ADR-031). */
export async function POST() {
  try {
    const res = await forward('/review/commit', 'POST');
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: body?.message ?? `Review API returned ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(body ?? { ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
