import { NextResponse } from 'next/server';

import { getApproved } from '@/lib/ideation';

/** GET /api/review/approved — approved scripts in export-contract shape. */
export async function GET() {
  try {
    const data = await getApproved();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reach the review API' },
      { status: 502 },
    );
  }
}
