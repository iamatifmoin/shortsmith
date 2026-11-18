import { redirect } from 'next/navigation';

import ReviewBoard from '@/components/ReviewBoard';
import TopNav from '@/components/TopNav';
import { getJson, getQueue } from '@/lib/ideation';
import type { ReviewItem } from '@/lib/types';

// Always render fresh — the queue changes as the operator and pipeline work.
export const dynamic = 'force-dynamic';

export default async function Page() {
  let items: ReviewItem[] = [];
  let error: string | null = null;

  // First run: no channel configured yet -> send the operator to the setup wizard.
  // (If the API is unreachable, fall through and show the error below.) redirect()
  // throws internally, so it must stay OUTSIDE the try/catch.
  let channel: unknown = null;
  let channelReachable = true;
  try {
    channel = await getJson('/channel');
  } catch {
    channelReachable = false;
  }
  if (channelReachable && !channel) redirect('/setup');

  try {
    items = (await getQueue()) as ReviewItem[];
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not reach the review API';
  }

  if (error) {
    return (
      <div className="app">
        <TopNav />
        <div className="empty">
          <h2>Can&rsquo;t reach the review service</h2>
          <p>
            Make sure the ideation app is running (it serves the review API). Start it with{' '}
            <code>pnpm ideation:start</code>, then reload this page.
          </p>
          <p style={{ color: 'var(--mut-2)', fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  return <ReviewBoard initialItems={items} />;
}
