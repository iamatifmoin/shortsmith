import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/review/:id/reject — reject a script; may also retire its fact. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await forward(`/review/${id}/reject`, 'POST', body);
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
