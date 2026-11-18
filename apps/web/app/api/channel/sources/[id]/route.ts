import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** DELETE /api/channel/sources/:id — remove a source from the active channel. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await forward(`/channel/sources/${id}`, 'DELETE');
    if (!res.ok) {
      return NextResponse.json({ error: `Channel API returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the channel API' },
      { status: 502 },
    );
  }
}
