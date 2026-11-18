import type { PerformanceInsights } from '@shortsmith/shared';

import PerformanceBoard from '@/components/PerformanceBoard';
import TopNav from '@/components/TopNav';
import { getJson } from '@/lib/ideation';
import type { MetricScript } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PerformancePage() {
  let scripts: MetricScript[] = [];
  let insights: PerformanceInsights | null = null;
  let error: string | null = null;

  try {
    const [s, i] = await Promise.all([getJson('/metrics/scripts'), getJson('/metrics/insights')]);
    scripts = s as MetricScript[];
    insights = i as PerformanceInsights;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not reach the metrics API';
  }

  if (error || !insights) {
    return (
      <div className="app">
        <TopNav />
        <div className="empty">
          <h2>Can&rsquo;t reach the metrics service</h2>
          <p>
            Make sure the ideation app is running. Start it with <code>pnpm ideation:start</code>,
            then reload this page.
          </p>
          <p style={{ color: 'var(--mut-2)', fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  return <PerformanceBoard initialScripts={scripts} initialInsights={insights} />;
}
