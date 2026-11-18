import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** PATCH /api/metrics/posts/:id — update a post's performance numbers. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const res = await forward(`/metrics/posts/${id}`, 'PATCH', body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { message?: string }).message ?? `Metrics API returned ${res.status}` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the metrics API' },
      { status: 502 },
    );
  }
}

/** DELETE /api/metrics/posts/:id — remove a recorded post. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await forward(`/metrics/posts/${id}`, 'DELETE');
    if (!res.ok) {
      return NextResponse.json({ error: `Metrics API returned ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the metrics API' },
      { status: 502 },
    );
  }
}
