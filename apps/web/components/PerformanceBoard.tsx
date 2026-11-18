'use client';

import { useState } from 'react';
import type { InsightBucket, PerformanceInsights } from '@shortsmith/shared';

import TopNav from '@/components/TopNav';
import { angleTypeLabel, confidenceLabel, platformLabel } from '@/lib/labels';
import type { MetricPost, MetricScript } from '@/lib/types';

const PLATFORMS: Array<MetricPost['platform']> = ['YOUTUBE', 'INSTAGRAM'];

export default function PerformanceBoard({
  initialScripts,
  initialInsights,
}: {
  initialScripts: MetricScript[];
  initialInsights: PerformanceInsights;
}) {
  const [scripts, setScripts] = useState<MetricScript[]>(initialScripts);
  const [insights, setInsights] = useState<PerformanceInsights>(initialInsights);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  function flash(msg: string, error = false) {
    setToast({ msg, error });
    window.setTimeout(() => setToast(null), 2600);
  }

  async function reload() {
    setBusy(true);
    try {
      const [s, i] = await Promise.all([
        fetch('/api/metrics/scripts', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/metrics/insights', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setScripts(s as MetricScript[]);
      setInsights(i as PerformanceInsights);
    } catch {
      flash("Couldn't refresh", true);
    } finally {
      setBusy(false);
    }
  }

  async function addPost(scriptId: string, platform: MetricPost['platform']) {
    setBusy(true);
    try {
      const res = await fetch('/api/metrics/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scriptId, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not add the post');
      flash(`Added ${platformLabel(platform)} post`);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not add the post', true);
    } finally {
      setBusy(false);
    }
  }

  const postedCount = scripts.reduce((n, s) => n + s.posts.length, 0);

  return (
    <div className="app">
      <TopNav>
        <span className="count">
          {insights.totalPosts} {insights.totalPosts === 1 ? 'post recorded' : 'posts recorded'}
        </span>
        <button className="btn ghost" onClick={reload} disabled={busy}>
          Refresh
        </button>
      </TopNav>

      <div className="page">
        <div className="page-inner">
          <h1 className="page-title">What&rsquo;s working</h1>
          <p className="page-sub">
            Record how each posted clip performed, and this learns which angles, hooks and fact
            types land — then feeds that back into how new scripts are scored and written.
          </p>

          {!insights.enoughData && (
            <div className="banner">
              {insights.totalPosts === 0
                ? 'No posts recorded yet. Add your first few below — once there are at least 5, these learnings start steering the generator.'
                : `${insights.totalPosts} of 5 posts recorded. A few more and these learnings start steering the generator automatically.`}
            </div>
          )}

          {insights.totalPosts > 0 && (
            <div className="insight-groups">
              <InsightGroup
                title="By angle type"
                sub="The kind of take the script takes"
                buckets={insights.byAngleType.map((b) => ({ ...b, label: angleTypeLabel(b.key) }))}
              />
              <InsightGroup title="By hook opener" sub="How the first line starts" buckets={insights.byHookOpener} />
              <InsightGroup
                title="By fact confidence"
                sub="How solid the underlying fact is"
                buckets={insights.byConfidence.map((b) => ({ ...b, label: confidenceLabel(b.key).text }))}
              />
            </div>
          )}

          <h2 className="page-title" style={{ fontSize: 16 }}>
            Record posts &amp; performance
          </h2>
          <p className="page-sub">
            Approved scripts you&rsquo;ve posted. Add the clip, then fill in its numbers as they come
            in. {postedCount > 0 ? `${postedCount} recorded so far.` : ''}
          </p>

          {scripts.length === 0 && (
            <div className="empty" style={{ padding: '40px 0' }}>
              No approved scripts yet. Approve some in Review first.
            </div>
          )}

          {scripts.map((s) => (
            <ScriptCard key={s.id} script={s} busy={busy} onAdd={addPost} onChanged={reload} onToast={flash} />
          ))}
        </div>
      </div>

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}

function InsightGroup({ title, sub, buckets }: { title: string; sub: string; buckets: InsightBucket[] }) {
  if (!buckets.length) return null;
  return (
    <div className="insight-group">
      <h3>{title}</h3>
      <p className="sub">{sub}</p>
      {buckets.map((b) => (
        <div key={b.key} className={`bucket${b.posts < 2 ? ' thin' : ''}`}>
          <div className="brow">
            <span className="blabel">{b.label}</span>
            <span className="bmeta">
              {b.posts}p · {compact(b.avgViews)} views
              {b.avgRetentionPct != null ? ` · ${Math.round(b.avgRetentionPct)}% kept` : ''}
            </span>
          </div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.round(b.score * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ScriptCard({
  script,
  busy,
  onAdd,
  onChanged,
  onToast,
}: {
  script: MetricScript;
  busy: boolean;
  onAdd: (scriptId: string, platform: MetricPost['platform']) => void;
  onChanged: () => void;
  onToast: (msg: string, error?: boolean) => void;
}) {
  const byPlatform = new Map(script.posts.map((p) => [p.platform, p]));
  return (
    <div className="pcard">
      <p className="phook">{script.title ?? script.hook}</p>
      <p className="pfact">{script.primaryFact}</p>
      <div className="ptags">
        <span className="badge neutral">{angleTypeLabel(script.angleType)}</span>
        <span className={`badge ${confidenceLabel(script.confidence).tone}`}>
          {confidenceLabel(script.confidence).text}
        </span>
        <span className="badge neutral">{script.hookOpenerLabel}</span>
      </div>

      {PLATFORMS.map((platform) => {
        const post = byPlatform.get(platform);
        return (
          <div key={platform} className="platform-row">
            <div className="phead">
              <span className="badge score">{platformLabel(platform)}</span>
              {!post && (
                <button className="btn sm" disabled={busy} onClick={() => onAdd(script.id, platform)}>
                  Add {platformLabel(platform)} post
                </button>
              )}
            </div>
            {post && <PostEditor post={post} onChanged={onChanged} onToast={onToast} />}
          </div>
        );
      })}
    </div>
  );
}

const NUMS = [
  ['views', 'Views'],
  ['retentionPct', 'Retention %'],
  ['avgViewDurationSec', 'Avg view (s)'],
  ['likes', 'Likes'],
  ['comments', 'Comments'],
  ['shares', 'Shares'],
  ['subscribersGained', 'Subscribers gained'],
] as const;

type NumField = (typeof NUMS)[number][0];

function PostEditor({
  post,
  onChanged,
  onToast,
}: {
  post: MetricPost;
  onChanged: () => void;
  onToast: (msg: string, error?: boolean) => void;
}) {
  const initial = () => ({
    externalUrl: post.externalUrl ?? '',
    postedAt: post.postedAt ? post.postedAt.slice(0, 10) : '',
    views: str(post.views),
    retentionPct: str(post.retentionPct),
    avgViewDurationSec: str(post.avgViewDurationSec),
    likes: str(post.likes),
    comments: str(post.comments),
    shares: str(post.shares),
    subscribersGained: str(post.subscribersGained),
  });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  function set(k: keyof ReturnType<typeof initial>, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        externalUrl: form.externalUrl,
        postedAt: form.postedAt ? new Date(form.postedAt).toISOString() : undefined,
      };
      for (const [k] of NUMS) {
        const raw = form[k as NumField];
        if (k === 'retentionPct' || k === 'avgViewDurationSec') {
          body[k] = raw.trim() === '' ? null : Number(raw);
        } else {
          body[k] = raw.trim() === '' ? 0 : Math.round(Number(raw));
        }
      }
      const res = await fetch(`/api/metrics/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save');
      onToast('Performance saved');
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save', true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/metrics/posts/${post.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove');
      onToast('Post removed');
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not remove', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-field" style={{ gridColumn: '1 / -1' }}>
          <label>Link to the posted clip</label>
          <input
            type="text"
            placeholder="https://..."
            value={form.externalUrl}
            onChange={(e) => set('externalUrl', e.target.value)}
          />
        </div>
        <div className="metric-field">
          <label>Posted on</label>
          <input type="date" value={form.postedAt} onChange={(e) => set('postedAt', e.target.value)} />
        </div>
        {NUMS.map(([k, label]) => (
          <div className="metric-field" key={k}>
            <label>{label}</label>
            <input
              type="number"
              min={0}
              value={form[k as NumField]}
              onChange={(e) => set(k as NumField, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="post-actions">
        <button className="btn approve sm" onClick={save} disabled={saving}>
          Save performance
        </button>
        <button className="btn danger sm" onClick={remove} disabled={saving}>
          Remove
        </button>
        {post.metricsUpdatedAt && (
          <span className="updated">Updated {String(post.metricsUpdatedAt).slice(0, 10)}</span>
        )}
      </div>
    </div>
  );
}

function str(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

/** Compact large numbers for the leaderboard (1234 -> 1.2k). */
function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}
