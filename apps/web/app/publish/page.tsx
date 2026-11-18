import type { PublishTaskView } from '@shortsmith/shared';

import PublishBoard from '@/components/PublishBoard';
import TopNav from '@/components/TopNav';
import { getJson } from '@/lib/ideation';

// Always render fresh — the publish queue changes as renders finish and the
// operator schedules clips.
export const dynamic = 'force-dynamic';

export default async function PublishPage() {
  let tasks: PublishTaskView[] = [];
  let error: string | null = null;

  try {
    tasks = (await getJson('/publish/tasks')) as PublishTaskView[];
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not reach the publish API';
  }

  if (error) {
    return (
      <div className="app">
        <TopNav />
        <div className="empty">
          <h2>Can&rsquo;t reach the publish service</h2>
          <p>
            Make sure the ideation app is running (it serves the publish API). Start it with{' '}
            <code>pnpm ideation:start</code>, then reload this page.
          </p>
          <p style={{ color: 'var(--mut-2)', fontSize: 13 }}>{error}</p>
        </div>
      </div>
    );
  }

  return <PublishBoard initialTasks={tasks} />;
}
