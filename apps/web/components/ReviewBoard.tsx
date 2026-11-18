'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import TopNav from '@/components/TopNav';
import { angleTypeLabel, confidenceLabel, flagLabel, sourceTierLabel } from '@/lib/labels';
import type { ReviewClaim, ReviewItem } from '@/lib/types';

/** Remaining approval capacity for the active series (ADR-031). */
interface Capacity {
  seriesKey: string;
  dailyClips: number;
  inFlight: number;
  pendingApprovals: number;
  remaining: number;
}

/** Local editable model for the selected script (tags kept as text while editing). */
interface EditModel {
  hook: string;
  body: string;
  cta: string;
  hasPublish: boolean;
  title: string;
  description: string;
  tagsText: string;
  hashtagsText: string;
  igCaption: string;
  thumbnailText: string;
  backgroundSuggestion: string;
  musicMood: string;
}

function toEditModel(it: ReviewItem): EditModel {
  const p = it.publish;
  return {
    hook: it.hook,
    body: it.body,
    cta: it.cta,
    hasPublish: !!p,
    title: p?.title ?? '',
    description: p?.description ?? '',
    tagsText: (p?.tags ?? []).join(', '),
    hashtagsText: (p?.hashtags ?? []).join(' '),
    igCaption: p?.igCaption ?? '',
    thumbnailText: p?.thumbnailText ?? '',
    backgroundSuggestion: p?.backgroundSuggestion ?? '',
    musicMood: p?.musicMood ?? '',
  };
}

const splitList = (s: string, sep: RegExp) =>
  s
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

/** Build the PATCH payload the ideation API expects. */
function toPatchPayload(m: EditModel) {
  const payload: Record<string, unknown> = {
    hook: m.hook,
    editedBody: m.body,
    cta: m.cta,
  };
  if (m.hasPublish) {
    payload.publishPackage = {
      title: m.title,
      description: m.description,
      tags: splitList(m.tagsText, /,/),
      hashtags: splitList(m.hashtagsText, /[,\s]+/),
      igCaption: m.igCaption,
      thumbnailText: m.thumbnailText,
      backgroundSuggestion: m.backgroundSuggestion || undefined,
      musicMood: m.musicMood || undefined,
    };
  }
  return payload;
}

export default function ReviewBoard({ initialItems }: { initialItems: ReviewItem[] }) {
  const [items, setItems] = useState<ReviewItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [model, setModel] = useState<EditModel | null>(
    initialItems[0] ? toEditModel(initialItems[0]) : null,
  );
  const [original, setOriginal] = useState<string>(
    initialItems[0] ? JSON.stringify(toEditModel(initialItems[0])) : '',
  );
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchStage, setFetchStage] = useState('Scanning sources…');
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const dirty = model != null && JSON.stringify(model) !== original;
  const staged = items.filter((i) => i.reviewSelection != null);
  const stagedApprovals = items.filter((i) => i.reviewSelection === 'APPROVE').length;
  // Empty -> the harvest API falls back to the active channel (one instance = one channel).
  const seriesKey = items[0]?.seriesKey ?? capacity?.seriesKey ?? '';

  function flash(msg: string, error = false) {
    setToast({ msg, error });
    window.setTimeout(() => setToast(null), 3200);
  }

  const loadCapacity = useCallback(async () => {
    try {
      const res = await fetch('/api/review/capacity', { cache: 'no-store' });
      if (!res.ok) return;
      const list: Capacity[] = await res.json();
      if (!Array.isArray(list) || list.length === 0) return setCapacity(null);
      const key = items[0]?.seriesKey ?? list[0].seriesKey;
      setCapacity(list.find((c) => c.seriesKey === key) ?? list[0]);
    } catch {
      /* non-fatal — cap UI just won't show */
    }
  }, [items]);

  useEffect(() => {
    void loadCapacity();
  }, [loadCapacity]);

  function select(it: ReviewItem) {
    setSelectedId(it.id);
    const m = toEditModel(it);
    setModel(m);
    setOriginal(JSON.stringify(m));
  }

  function patch(partial: Partial<EditModel>) {
    setModel((m) => (m ? { ...m, ...partial } : m));
  }

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch('/api/review', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Couldn't load the queue (${res.status})`);
      const data: ReviewItem[] = await res.json();
      setItems(data);
      if (data.length && !data.some((i) => i.id === selectedId)) select(data[0]);
      if (!data.length) {
        setSelectedId(null);
        setModel(null);
      }
      await loadCapacity();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Refresh failed', true);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits(silent = false): Promise<boolean> {
    if (!selected || !model) return false;
    const res = await fetch(`/api/review/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toPatchPayload(model)),
    });
    if (!res.ok) {
      flash("Couldn't save your changes", true);
      return false;
    }
    setItems((cur) =>
      cur.map((i) =>
        i.id === selected.id
          ? {
              ...i,
              hook: model.hook,
              body: model.body,
              cta: model.cta,
              publish: model.hasPublish
                ? ((toPatchPayload(model).publishPackage as ReviewItem['publish']) ?? i.publish)
                : i.publish,
            }
          : i,
      ),
    );
    setOriginal(JSON.stringify(model));
    if (!silent) flash('Changes saved');
    return true;
  }

  /** Stage (or clear) a pending approve/reject choice — nothing renders yet (ADR-031). */
  async function stage(id: string, selection: 'APPROVE' | 'REJECT' | null) {
    // Save pending edits on the selected script before approving it.
    if (selection === 'APPROVE' && id === selected?.id && dirty) await saveEdits(true);
    const prev = items;
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, reviewSelection: selection } : i)));
    try {
      const res = await fetch(`/api/review/${id}/select`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selection }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? 'Could not stage this choice');
      }
      await loadCapacity();
    } catch (e) {
      setItems(prev); // revert the optimistic toggle
      flash(e instanceof Error ? e.message : 'Could not stage this choice', true);
    }
  }

  /** Commit all staged choices: approved render, rejected drop (the Render button). */
  async function commit() {
    if (staged.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/review/commit', { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? 'Commit failed');
      const a = d?.approved?.length ?? 0;
      const r = d?.rejected?.length ?? 0;
      flash(`Rendering ${a} clip${a === 1 ? '' : 's'}${r ? `, rejected ${r}` : ''}. Watch the Publish tab.`);
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Commit failed', true);
    } finally {
      setBusy(false);
    }
  }

  /** Plain-language label per pipeline stage, shown on the fetch loader. */
  const STAGE_LABEL: Record<string, string> = {
    harvest: 'Scanning sources…',
    extract: 'Pulling out the facts…',
    rank: 'Ranking what’s novel…',
    generate: 'Writing the scripts…',
  };

  /** One poll of the pipeline-busy endpoint. null = couldn't read it. */
  async function pollStatus(): Promise<{ busy: boolean; label: string } | null> {
    try {
      const r = await fetch('/api/harvest/status', { cache: 'no-store' });
      if (!r.ok) return null;
      const d = (await r.json()) as { busy?: boolean; byStage?: Record<string, number> };
      const order = ['harvest', 'extract', 'rank', 'generate'];
      const active = order.filter((s) => (d.byStage?.[s] ?? 0) > 0);
      return { busy: Boolean(d.busy), label: active.length ? STAGE_LABEL[active[active.length - 1]] : '' };
    } catch {
      return null;
    }
  }

  /**
   * Block until the pipeline drains (or a safety cap). We poll until we've seen
   * it go idle — requiring two idle reads if we never caught it busy, so a fast
   * run doesn't end the loader before any script lands. A hard cap stops a hang.
   */
  async function waitForPipelineIdle() {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const POLL_MS = 1500;
    const MAX_MS = 4 * 60 * 1000;
    const start = Date.now();
    let sawBusy = false;
    let idle = 0;
    let unknown = 0;
    await sleep(700); // let the just-enqueued jobs register as "waiting"
    while (Date.now() - start < MAX_MS) {
      const s = await pollStatus();
      if (s == null) {
        if (++unknown >= 4) return; // status unreachable repeatedly — stop waiting
      } else {
        unknown = 0;
        if (s.label) setFetchStage(s.label);
        if (s.busy) {
          sawBusy = true;
          idle = 0;
        } else if (++idle >= (sawBusy ? 1 : 2)) {
          return;
        }
      }
      await sleep(POLL_MS);
    }
  }

  /**
   * Trigger a pipeline run and keep a blocking loader up until every stage has
   * finished, then pull in the new drafts. The overlay locks the Review tab so
   * nothing is approved/edited against a half-filled queue.
   */
  async function fetchScripts() {
    if (fetching) return;
    setFetching(true);
    setFetchStage('Scanning sources…');
    try {
      const res = await fetch('/api/harvest/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(seriesKey ? { seriesKey } : {}),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? 'Could not start a fetch');
      await waitForPipelineIdle();
      await refresh();
      flash('New scripts are in — review away.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not fetch new scripts', true);
    } finally {
      setFetching(false);
    }
  }

  const capExhausted = capacity != null && capacity.remaining <= 0;

  return (
    <div className="app">
      <TopNav>
        {capacity && (
          <span className="count" title="Daily clip cap — reject or schedule a clip to free a slot">
            {capacity.remaining} of {capacity.dailyClips} approvals left today
          </span>
        )}
        <button
          className={`btn ghost${fetching ? ' fetching' : ''}`}
          onClick={fetchScripts}
          disabled={busy || fetching}
        >
          {fetching ? 'Fetching…' : 'Fetch new scripts'}
        </button>
        <button className="btn ghost" onClick={refresh} disabled={busy || fetching}>
          Refresh
        </button>
        <button
          className="btn approve"
          onClick={commit}
          disabled={busy || fetching || staged.length === 0}
        >
          Render {stagedApprovals > 0 ? `${stagedApprovals} ` : ''}
          {stagedApprovals === 1 ? 'clip' : 'clips'}
        </button>
      </TopNav>

      <div className="main">
        <nav className="queue">
          <div className="queue-head">
            Review queue · strongest hook first
            <br />
            <span style={{ color: 'var(--mut-2)', fontWeight: 400 }}>
              {items.length} waiting · {stagedApprovals} to render · then press Render
            </span>
          </div>
          {items.map((it) => (
            <button
              key={it.id}
              className={`qitem${it.id === selectedId ? ' active' : ''}`}
              onClick={() => select(it)}
            >
              <div className="qtop">
                <span className="badge score">Hook {it.hookScore}/100</span>
                {it.reviewSelection === 'APPROVE' && <span className="badge good">✓ Will render</span>}
                {it.reviewSelection === 'REJECT' && <span className="badge low">✕ Rejecting</span>}
                {it.reviewSelection == null && (
                  <span className="badge neutral">{angleTypeLabel(it.angleType)}</span>
                )}
              </div>
              <div className="qhook">{it.hook}</div>
              <div className="qmeta">
                <ConfidenceBadge value={it.primaryFact.confidence} />
                {it.flags.length > 0 && (
                  <span className="badge mid">
                    {it.flags.length} {it.flags.length === 1 ? 'thing to check' : 'things to check'}
                  </span>
                )}
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <div className="empty">Nothing to review. Click “Fetch new scripts”.</div>
          )}
        </nav>

        <section className="detail">
          {selected && model ? (
            <div className="detail-inner">
              <div className="actionbar">
                {selected.reviewSelection === 'APPROVE' ? (
                  <button className="btn approve" onClick={() => stage(selected.id, null)} disabled={busy}>
                    ✓ Approved — click to unset
                  </button>
                ) : (
                  <button
                    className="btn approve"
                    onClick={() => stage(selected.id, 'APPROVE')}
                    disabled={busy || capExhausted}
                    title={capExhausted ? 'Daily cap reached — reject or schedule a clip first' : ''}
                  >
                    Approve for today
                  </button>
                )}
                <button className="btn" onClick={() => saveEdits()} disabled={busy || !dirty}>
                  {dirty ? 'Save changes' : 'Saved'}
                </button>
                <span className="spacer" />
                <span className="hint" style={{ maxWidth: 260 }}>
                  Choices stage up; press <strong>Render</strong> when you&rsquo;re happy with the batch.
                </span>
                {selected.reviewSelection === 'REJECT' ? (
                  <button className="btn reject" onClick={() => stage(selected.id, null)} disabled={busy}>
                    ✕ Rejecting — click to unset
                  </button>
                ) : (
                  <button className="btn reject" onClick={() => stage(selected.id, 'REJECT')} disabled={busy}>
                    Reject
                  </button>
                )}
              </div>

              <ScriptMeta item={selected} />

              {selected.flags.length > 0 && (
                <div className="section">
                  <h2>Before you approve</h2>
                  <p className="hint">
                    These are things worth a quick look. None of them block approval — you decide.
                  </p>
                  <div className="flags">
                    {selected.flags.map((f) => {
                      const { text, tone } = flagLabel(f);
                      return (
                        <div key={f} className={`flag ${tone}`}>
                          <span className="ic">{tone === 'warn' ? '!' : 'i'}</span>
                          <span>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="section">
                <h2>The script</h2>
                <p className="hint">Edit anything here before approving. Changes are saved to this script.</p>
                <Field label="Opening hook (the first spoken line)">
                  <textarea rows={2} value={model.hook} onChange={(e) => patch({ hook: e.target.value })} />
                </Field>
                <Field label="Main script (the voiceover)">
                  <textarea rows={6} value={model.body} onChange={(e) => patch({ body: e.target.value })} />
                </Field>
                <Field label="Call to action (the closing line)">
                  <textarea rows={2} value={model.cta} onChange={(e) => patch({ cta: e.target.value })} />
                </Field>
              </div>

              {model.hasPublish && (
                <div className="section">
                  <h2>Upload details</h2>
                  <p className="hint">
                    The title, description and tags that go up with the video. Edit to taste before approving.
                  </p>
                  <Field label="YouTube title">
                    <textarea rows={2} value={model.title} onChange={(e) => patch({ title: e.target.value })} />
                  </Field>
                  <Field label="YouTube description">
                    <textarea
                      rows={6}
                      value={model.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  </Field>
                  <Field label="YouTube tags (separated by commas)">
                    <textarea rows={2} value={model.tagsText} onChange={(e) => patch({ tagsText: e.target.value })} />
                  </Field>
                  <Field label="Hashtags">
                    <input
                      type="text"
                      value={model.hashtagsText}
                      onChange={(e) => patch({ hashtagsText: e.target.value })}
                    />
                  </Field>
                  <Field label="Instagram caption">
                    <textarea
                      rows={5}
                      value={model.igCaption}
                      onChange={(e) => patch({ igCaption: e.target.value })}
                    />
                  </Field>
                  <Field label="Words shown on the thumbnail">
                    <input
                      type="text"
                      value={model.thumbnailText}
                      onChange={(e) => patch({ thumbnailText: e.target.value })}
                    />
                  </Field>
                  <Field label="Suggested background footage">
                    <input
                      type="text"
                      value={model.backgroundSuggestion}
                      onChange={(e) => patch({ backgroundSuggestion: e.target.value })}
                    />
                  </Field>
                  <Field label="Suggested music mood">
                    <input type="text" value={model.musicMood} onChange={(e) => patch({ musicMood: e.target.value })} />
                  </Field>
                </div>
              )}

              <div className="section">
                <h2>Where this came from</h2>
                <p className="hint">
                  Every claim in the script traces back to a source. Open the link to check it yourself.
                </p>
                {selected.claims.map((c, i) => (
                  <Receipt key={c.factId + i} claim={c} />
                ))}
                {selected.claims.length === 0 && <p className="hint">No sources attached to this script.</p>}
              </div>
            </div>
          ) : (
            <div className="empty">
              <h2>You&rsquo;re all caught up</h2>
              <p>There are no scripts waiting for review. Click “Fetch new scripts” to pull in more.</p>
            </div>
          )}
        </section>
      </div>

      {fetching && (
        <div className="fetch-overlay" role="alertdialog" aria-busy="true" aria-live="assertive">
          <div className="fetch-card">
            <div className="spinner" aria-hidden="true" />
            <div className="fetch-title">Fetching new scripts</div>
            <div className="fetch-sub">{fetchStage || 'Working…'}</div>
            <div className="fetch-note">Hang tight — the Review tab is locked until this finishes.</div>
          </div>
        </div>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.msg}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: string | null }) {
  const { text, tone } = confidenceLabel(value);
  return <span className={`badge ${tone}`}>{text}</span>;
}

function ScriptMeta({ item }: { item: ReviewItem }) {
  return (
    <div className="section" style={{ paddingBottom: 14 }}>
      <h2>{item.primaryFact.canonicalClaim}</h2>
      <div className="kv">
        <span>About {item.estDurationSec}s</span>
        <span>·</span>
        <span>{item.wordCount} words</span>
        <span>·</span>
        <span>{angleTypeLabel(item.angleType)}</span>
      </div>
      <div className="qmeta" style={{ marginTop: 10 }}>
        <ConfidenceBadge value={item.primaryFact.confidence} />
        <span className="badge neutral">
          Backed by {item.primaryFact.corroborationCount}{' '}
          {item.primaryFact.corroborationCount === 1 ? 'source' : 'sources'}
        </span>
        <span className="badge score">Hook {item.hookScore}/100</span>
      </div>
    </div>
  );
}

function Receipt({ claim }: { claim: ReviewClaim }) {
  const date = claim.publishedAt ? String(claim.publishedAt).slice(0, 10) : null;
  return (
    <div className="receipt">
      <p className="snippet">&ldquo;{claim.snippet}&rdquo;</p>
      <div className="rmeta">
        <ConfidenceBadge value={claim.confidence} />
        <span className="badge neutral">{sourceTierLabel(claim.sourceTier)}</span>
        {claim.snippetVerified === false && (
          <span className="badge mid">Quote not verified</span>
        )}
        {date && <span className="badge neutral">Published {date}</span>}
        <a href={claim.sourceUrl} target="_blank" rel="noreferrer">
          Open source
        </a>
      </div>
    </div>
  );
}
