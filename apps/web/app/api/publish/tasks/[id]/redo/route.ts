import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/publish/tasks/:id/redo — re-render the same script (new take). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await forward(`/publish/tasks/${id}/redo`, 'POST');
    if (!res.ok) {
      return NextResponse.json({ error: `Publish API returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the publish API' },
      { status: 502 },
    );
  }
}
