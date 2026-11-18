import SetupWizard from '@/components/SetupWizard';
import { getJson } from '@/lib/ideation';
import type { ChannelConfigView } from '@/lib/types';

// Always fresh — the config changes as the operator edits it.
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  let config: ChannelConfigView | null = null;
  let error: string | null = null;
  try {
    config = (await getJson('/channel')) as ChannelConfigView | null;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not reach the channel API';
  }
  return <SetupWizard initialConfig={config} apiError={error} />;
}
