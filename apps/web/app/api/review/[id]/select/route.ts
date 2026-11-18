import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/review/:id/select — stage a pending approve/reject choice (ADR-031). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forward(`/review/${id}/select`, 'POST', body);
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return NextResponse.json(
        { error: detail?.message ?? `Review API returned ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
