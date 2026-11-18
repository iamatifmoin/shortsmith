import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/review/:id/approve — approve a script (Human Gate 1). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await forward(`/review/${id}/approve`, 'POST');
    if (!res.ok) {
      return NextResponse.json({ error: `Review API returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
