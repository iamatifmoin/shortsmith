import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** PATCH /api/review/:id — save operator edits to a script before approving. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const res = await forward(`/review/${id}`, 'PATCH', body);
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
