import { NextResponse } from 'next/server';

import { forward } from '@/lib/ideation';

/** POST /api/metrics/posts — record that an approved script was posted. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await forward('/metrics/posts', 'POST', body);
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
