'use client';

import { useState } from 'react';
import type { PublishTaskView } from '@shortsmith/shared';

import TopNav from '@/components/TopNav';

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  READY: { text: 'Rendered · sending to Telegram', tone: 'mid' },
  NOTIFIED: { text: 'On Telegram · schedule it', tone: 'score' },
  SCHEDULED: { text: 'Scheduled ✓', tone: 'good' },
};

export default function PublishBoard({ initialTasks }: { initialTasks: PublishTaskView[] }) {
  const [tasks, setTasks] = useState<PublishTaskView[]>(initialTasks);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function flash(msg: string, error = false) {
    setToast({ msg, error });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function refresh() {
    try {
      const res = await fetch('/api/publish/tasks', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Couldn't load the queue (${res.status})`);
      setTasks(await res.json());
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Refresh failed', true);
    }
  }

  async function act(id: string, action: 'scheduled' | 'redo' | 'reject', done: string) {
    setBusy(id + action);
    try {
      const res = await fetch(`/api/publish/tasks/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Action failed (${res.status})`);
      }
      flash(done);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Action failed', true);
    } finally {
      setBusy(null);
    }
  }

  const pending = tasks.filter((t) => t.status !== 'SCHEDULED').length;

  return (
    <div className="app">
      <TopNav>
        <span className="count">
          {pending} {pending === 1 ? 'clip' : 'clips'} to schedule
        </span>
        <button className="btn ghost" onClick={refresh} disabled={busy != null}>
          Refresh
        </button>
      </TopNav>

      <div className="detail">
        <div className="detail-inner">
          <div className="section" style={{ paddingBottom: 10 }}>
            <h2>Publish queue · Gate 2</h2>
            <p className="hint">
              Each rendered clip is sent to your Telegram with its copy-paste title/description/caption and
              its slot time. Upload it in YouTube Studio and the Instagram app, schedule it for that slot,
              then reply <strong>Scheduled</strong> on Telegram or press <strong>Mark scheduled</strong> here.
              Not happy with a take? <strong>Redo</strong> re-renders it (reusing the cached voiceover);
              <strong> Reject</strong> drops it and frees the slot for another script.
            </p>
          </div>

          {tasks.length === 0 && (
            <div className="empty">
              <h2>Nothing in the publish queue</h2>
              <p>Approve and render scripts on the Review tab; finished clips show up here.</p>
            </div>
          )}

          {tasks.map((t) => {
            const s = STATUS_LABEL[t.status] ?? { text: t.status, tone: 'neutral' };
            return (
              <div key={t.id} className="receipt" style={{ display: 'grid', gap: 10 }}>
                <div className="qtop">
                  <span className={`badge ${s.tone}`}>{s.text}</span>
                </div>
                <div className="qhook" style={{ fontWeight: 600 }}>{t.hook}</div>
                <div className="kv" style={{ flexWrap: 'wrap', gap: 10 }}>
                  {Object.entries(t.slot.byZone).map(([label, when]) => (
                    <span key={label}>
                      <strong>{label}:</strong> {when}
                    </span>
                  ))}
                </div>
                <div className="actionbar" style={{ border: 'none', padding: 0 }}>
                  {t.status !== 'SCHEDULED' && (
                    <button
                      className="btn approve"
                      disabled={busy != null}
                      onClick={() => act(t.id, 'scheduled', 'Marked as scheduled')}
                    >
                      Mark scheduled
                    </button>
                  )}
                  <button
                    className="btn"
                    disabled={busy != null}
                    onClick={() => act(t.id, 'redo', 'Re-rendering a fresh take')}
                  >
                    Redo
                  </button>
                  <span className="spacer" />
                  <button
                    className="btn reject"
                    disabled={busy != null}
                    onClick={() => act(t.id, 'reject', 'Clip rejected · slot freed')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
