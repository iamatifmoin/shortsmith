'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import TopNav from '@/components/TopNav';
import type { ChannelConfigView, ChannelSource, ConnectionsStatus } from '@/lib/types';

/** Comma-join / split helpers for the list inputs. */
const join = (xs?: string[] | null) => (xs ?? []).join(', ');
const split = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

type Pd = Record<string, unknown>;
type Pc = Record<string, unknown>;
type Links = Record<string, string>;

/** Plain-language names for the four source tiers (no jargon in the UI). */
const TIERS = [
  { n: 1, label: 'Official', hint: 'first-party / the source themselves' },
  { n: 2, label: 'News', hint: 'press & established outlets' },
  { n: 3, label: 'Community', hint: 'forums, leaks, rumors' },
  { n: 4, label: 'Open web', hint: 'a general web search, as a fallback' },
];

export default function SetupWizard({
  initialConfig,
  apiError,
}: {
  initialConfig: ChannelConfigView | null;
  apiError: string | null;
}) {
  const router = useRouter();
  const c = initialConfig;
  const pd0 = (c?.publishDefaults ?? {}) as Pd;
  const pc0 = (c?.publishConfig ?? {}) as Pc;
  const links0 = (c?.links ?? {}) as Links;

  // Basics
  const [name, setName] = useState(c?.displayName || c?.name || '');
  const [description, setDescription] = useState(c?.description ?? '');
  const [website, setWebsite] = useState(links0.website ?? '');

  // Accounts (per-platform). Old data kept a single handle in publishDefaults.handle.
  const [ytHandle, setYtHandle] = useState(links0.youtubeHandle ?? (pd0.handle as string) ?? '');
  const [ytUrl, setYtUrl] = useState(links0.youtubeUrl ?? '');
  const [igHandle, setIgHandle] = useState(links0.instagramHandle ?? '');
  const [igUrl, setIgUrl] = useState(links0.instagramUrl ?? '');

  // What the videos are about
  const [subjectName, setSubjectName] = useState(c?.subjectName ?? '');
  const [subjectAliases, setSubjectAliases] = useState(join(c?.subjectAliases));
  const [topicTerms, setTopicTerms] = useState(join(c?.topicTerms));

  // Tone
  const [personality, setPersonality] = useState(c?.personality ?? '');

  // Fact-checking
  const [minConfidence, setMinConfidence] = useState(c?.minConfidence ?? 'STRONG_RUMOR');
  const [tiers, setTiers] = useState<number[]>(c?.allowedTiers ?? [2, 4]);

  // Upload defaults (publishDefaults)
  const [descriptionFooter, setDescriptionFooter] = useState((pd0.descriptionFooter as string) ?? '');
  const [aiDisclosure, setAiDisclosure] = useState((pd0.aiDisclosure as string) ?? 'Voiceover is AI-generated.');
  const [defaultTags, setDefaultTags] = useState(join(pd0.defaultTags as string[] | undefined));
  const [emoji, setEmoji] = useState(Boolean(pd0.emoji));
  const [maxHashtags, setMaxHashtags] = useState(Number(pd0.maxHashtags ?? 5));

  // Schedule (publishConfig)
  const [timezone, setTimezone] = useState((pc0.timezone as string) ?? 'America/New_York');
  const [slots, setSlots] = useState(join(pc0.slots as string[] | undefined) || '12:00, 19:00');
  const [dailyClips, setDailyClips] = useState(Number(pc0.dailyClips ?? 2));
  const [operatorTimezone, setOperatorTimezone] = useState((pc0.operatorTimezone as string) ?? 'UTC');

  // Sources
  const [sources, setSources] = useState<ChannelSource[]>(c?.sources ?? []);
  const [newSrc, setNewSrc] = useState({ name: '', tier: 2, url: '', rssUrl: '' });

  const [configId, setConfigId] = useState(c?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<ConnectionsStatus | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    apiError ? { text: apiError, ok: false } : null,
  );

  // Live connection status (booleans only — no secret values leave the server).
  useEffect(() => {
    let active = true;
    fetch('/api/channel/connections', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && d.llm) setConn(d as ConnectionsStatus);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function flash(text: string, ok: boolean) {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3600);
  }

  function toggleTier(t: number) {
    setTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()));
  }

  function buildLinks(): Links {
    const l: Links = {};
    if (website.trim()) l.website = website.trim();
    if (ytHandle.trim()) l.youtubeHandle = ytHandle.trim();
    if (ytUrl.trim()) l.youtubeUrl = ytUrl.trim();
    if (igHandle.trim()) l.instagramHandle = igHandle.trim();
    if (igUrl.trim()) l.instagramUrl = igUrl.trim();
    return l;
  }

  function buildPayload() {
    return {
      // One name field drives both the internal name and the header brand.
      name,
      displayName: name,
      description,
      subjectName,
      subjectAliases: split(subjectAliases),
      topicTerms: split(topicTerms),
      personality,
      minConfidence,
      allowedTiers: tiers,
      links: buildLinks(),
      publishDefaults: {
        ...pd0,
        descriptionFooter,
        aiDisclosure,
        defaultTags: split(defaultTags),
        emoji,
        maxHashtags,
      },
      publishConfig: {
        ...pc0,
        timezone,
        slots: split(slots),
        dailyClips,
        operatorTimezone,
      },
    };
  }

  async function save(): Promise<ChannelConfigView | null> {
    const res = await fetch('/api/channel', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? 'Could not save the channel');
    if (data?.id) setConfigId(data.id);
    if (Array.isArray(data?.sources)) setSources(data.sources);
    return data as ChannelConfigView;
  }

  async function onSave(runAfter: boolean) {
    if (busy) return;
    if (!name.trim() || !subjectName.trim()) {
      flash('Channel name and subject are required.', false);
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      await save();
      if (runAfter) {
        const r = await fetch('/api/harvest/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          throw new Error(d?.error ?? 'Saved, but could not start a fetch');
        }
        router.push('/');
        return;
      }
      flash('Channel saved.', true);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not save', false);
    } finally {
      setBusy(false);
    }
  }

  async function addSource() {
    if (busy) return;
    if (!newSrc.name.trim() || !newSrc.url.trim()) {
      flash('Source name and URL are required.', false);
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      // The channel row must exist before a source can attach to it.
      if (!configId) await save();
      const res = await fetch('/api/channel/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newSrc),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not add the source');
      setSources((prev) => {
        const rest = prev.filter((s) => s.id !== data.id && s.key !== data.key);
        return [...rest, data as ChannelSource].sort((a, b) => a.tier - b.tier);
      });
      setNewSrc({ name: '', tier: newSrc.tier, url: '', rssUrl: '' });
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not add the source', false);
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/channel/sources/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove the source');
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not remove the source', false);
    } finally {
      setBusy(false);
    }
  }

  const firstRun = !configId;

  return (
    <div className="app">
      <TopNav>
        <button className="btn approve" onClick={() => onSave(false)} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn ghost" onClick={() => onSave(true)} disabled={busy}>
          Save &amp; fetch scripts
        </button>
      </TopNav>

      <div className="setup">
        <div className="setup-inner">
          <p className="setup-intro">
            {firstRun
              ? 'Set up your channel — tell the pipeline what your channel is about, how it should sound, and where to get its facts. You can change any of this later.'
              : 'Your channel settings. Edit, then press Save at the top right. Everything here applies to both your YouTube and Instagram posts, except where a section is split by platform.'}
          </p>

          <section className="setup-card">
            <h3>Connections &amp; keys</h3>
            <p className="hint">
              The pipeline needs a few API keys to run. These live in your <code>.env</code> files, not
              saved here — this card just shows what&rsquo;s live. The repo&rsquo;s <strong>README</strong> has
              step-by-step instructions for each.
            </p>
            <div className="conn-list">
              <div className="conn-row">
                <div className="conn-main">
                  <span className="conn-name">Script writer{conn ? ` · ${titleCase(conn.llm.provider)}` : ''}</span>
                  <span className="conn-desc">
                    Writes the scripts. Key in <code>apps/ideation/.env</code> ·{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">get a free Gemini key</a>
                  </span>
                </div>
                <ConnPill state={!conn ? 'wait' : conn.llm.keyConfigured ? 'ok' : 'off'}
                  label={!conn ? 'Checking…' : conn.llm.keyConfigured ? 'Connected' : 'Not set'} />
              </div>

              <div className="conn-row">
                <div className="conn-main">
                  <span className="conn-name">Publishing · Telegram</span>
                  <span className="conn-desc">
                    Sends finished clips to your phone. Token in <code>apps/ideation/.env</code> ·{' '}
                    <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">create a bot</a>, then message it once.
                  </span>
                </div>
                <ConnPill
                  state={!conn ? 'wait' : conn.telegram.botConfigured && conn.telegram.chatConfigured ? 'ok' : conn.telegram.botConfigured ? 'warn' : 'off'}
                  label={!conn ? 'Checking…' : conn.telegram.botConfigured && conn.telegram.chatConfigured ? 'Connected' : conn.telegram.botConfigured ? 'Needs chat' : 'Not set'} />
              </div>

              <div className="conn-row">
                <div className="conn-main">
                  <span className="conn-name">Voiceover · ElevenLabs</span>
                  <span className="conn-desc">
                    The video narration (the only paid service). Key in <code>apps/render/.env</code> ·{' '}
                    <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">elevenlabs.io</a>
                  </span>
                </div>
                <ConnPill state="info" label="In render/.env" />
              </div>

              <div className="conn-row">
                <div className="conn-main">
                  <span className="conn-name">Database &amp; queue</span>
                  <span className="conn-desc">PostgreSQL + Redis. Started by <code>docker compose up -d</code>.</span>
                </div>
                <ConnPill state="info" label="Docker" />
              </div>

              <div className="conn-row">
                <div className="conn-main">
                  <span className="conn-name">Background images</span>
                  <span className="conn-desc">Keyless Openverse by default; optional Unsplash/Pixabay key in <code>apps/render/.env</code>.</span>
                </div>
                <ConnPill state="info" label="Optional" />
              </div>
            </div>
          </section>

          <section className="setup-card">
            <h3>Channel basics</h3>
            <p className="hint">The name shown in this dashboard and used across your uploads.</p>
            <div className="row-2">
              <div className="field">
                <label>Channel name <span className="sub">(required)</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Channel" />
              </div>
              <div className="field">
                <label>Website <span className="sub">(optional)</span></label>
                <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div className="field">
              <label>Short description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What your channel is about, in a line" />
            </div>
          </section>

          <section className="setup-card">
            <h3>Your accounts</h3>
            <p className="hint">Where your videos get posted. Fill in the account you have on each platform — it&rsquo;s used to label and (later) auto-post your clips.</p>
            <div className="row-2">
              <div className="platform-col">
                <div className="platform-head yt">YouTube</div>
                <div className="field">
                  <label>Channel handle</label>
                  <input type="text" value={ytHandle} onChange={(e) => setYtHandle(e.target.value)} placeholder="@mychannel" />
                </div>
                <div className="field">
                  <label>Channel URL</label>
                  <input type="text" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://youtube.com/@mychannel" />
                </div>
              </div>
              <div className="platform-col">
                <div className="platform-head ig">Instagram</div>
                <div className="field">
                  <label>Profile handle</label>
                  <input type="text" value={igHandle} onChange={(e) => setIgHandle(e.target.value)} placeholder="@mychannel" />
                </div>
                <div className="field">
                  <label>Profile URL</label>
                  <input type="text" value={igUrl} onChange={(e) => setIgUrl(e.target.value)} placeholder="https://instagram.com/mychannel" />
                </div>
              </div>
            </div>
          </section>

          <section className="setup-card">
            <h3>What your videos are about</h3>
            <p className="hint">The topic behind every video. This is what the pipeline searches for and writes scripts about.</p>
            <div className="field">
              <label>Main topic <span className="sub">(required)</span></label>
              <input type="text" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. a phone, a game, a sport, a TV show" />
            </div>
            <div className="field">
              <label>Other names it&rsquo;s known by <span className="sub">(separate with commas)</span></label>
              <input type="text" value={subjectAliases} onChange={(e) => setSubjectAliases(e.target.value)} placeholder="short names or nicknames people search for" />
            </div>
            <div className="field">
              <label>Keywords to watch for <span className="sub">(separate with commas)</span></label>
              <input type="text" value={topicTerms} onChange={(e) => setTopicTerms(e.target.value)} placeholder="words that mark a news article as relevant" />
            </div>
          </section>

          <section className="setup-card">
            <h3>Tone &amp; personality</h3>
            <p className="hint">How the narrator should sound. Keep it PG-13 and advertiser-friendly.</p>
            <div className="field">
              <label>Describe the voice</label>
              <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="e.g. Confident, upbeat, clued-in — always has the real info first." />
            </div>
          </section>

          <section className="setup-card">
            <h3>Fact-checking</h3>
            <p className="hint">How sure the pipeline must be about a fact before it writes a script around it.</p>
            <div className="field">
              <label>How confirmed must a fact be?</label>
              <select value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)}>
                <option value="CONFIRMED">Confirmed only — officially announced</option>
                <option value="STRONG_RUMOR">Strong rumors &amp; up — widely reported</option>
                <option value="RUMOR">Allow rumors — anything credible</option>
              </select>
            </div>
            <div className="field">
              <label>Which kinds of sources to allow</label>
              <div className="tier-grid">
                {TIERS.map((t) => (
                  <label key={t.n} className="tier-check" title={t.hint}>
                    <input type="checkbox" checked={tiers.includes(t.n)} onChange={() => toggleTier(t.n)} />
                    <span>
                      <strong>{t.label}</strong>
                      <span className="tier-sub">{t.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="setup-card">
            <h3>Sources</h3>
            <p className="hint">
              The sites you trust, strongest first. Add an RSS feed where you can — it&rsquo;s the most reliable.
              With <strong>Open web</strong> allowed above, the pipeline can still find facts before you&rsquo;ve added any.
            </p>
            {sources.length === 0 ? (
              <p className="hint" style={{ marginBottom: 14 }}>No sources yet. Add a few below, or rely on the Open web fallback.</p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {sources.map((s) => (
                  <div className="srow" key={s.id}>
                    <span className="src-name">{s.name}</span>
                    <span className="tier-pill">{TIERS.find((t) => t.n === s.tier)?.label ?? `Tier ${s.tier}`}</span>
                    <span className="src-url" title={s.rssUrl ?? s.url}>{s.rssUrl ?? s.url}</span>
                    <button className="btn danger" onClick={() => removeSource(s.id)} disabled={busy}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="srow" style={{ borderTop: '1px solid var(--line)' }}>
              <input type="text" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} placeholder="Source name" />
              <select value={newSrc.tier} onChange={(e) => setNewSrc({ ...newSrc, tier: Number(e.target.value) })}>
                {TIERS.map((t) => <option key={t.n} value={t.n}>{t.label}</option>)}
              </select>
              <input type="text" value={newSrc.rssUrl} onChange={(e) => setNewSrc({ ...newSrc, rssUrl: e.target.value })} placeholder="RSS feed URL (preferred)" />
              <input type="text" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} placeholder="Page URL" />
            </div>
            <div style={{ marginTop: 10 }}>
              <button className="btn ghost" onClick={addSource} disabled={busy}>Add source</button>
            </div>
          </section>

          <section className="setup-card">
            <h3>Upload defaults</h3>
            <p className="hint">Added automatically to every YouTube and Instagram upload.</p>
            <div className="field">
              <label>Standing text for every description</label>
              <textarea value={descriptionFooter} onChange={(e) => setDescriptionFooter(e.target.value)} placeholder="e.g. a disclaimer or a line about your channel, added to the end of every description." />
            </div>
            <div className="row-2">
              <div className="field">
                <label>AI disclosure line</label>
                <input type="text" value={aiDisclosure} onChange={(e) => setAiDisclosure(e.target.value)} />
              </div>
              <div className="field">
                <label>Default tags <span className="sub">(separate with commas)</span></label>
                <input type="text" value={defaultTags} onChange={(e) => setDefaultTags(e.target.value)} />
              </div>
            </div>
            <div className="row-2">
              <div className="field check">
                <input type="checkbox" checked={emoji} onChange={(e) => setEmoji(e.target.checked)} />
                <label style={{ margin: 0 }}>Allow one emoji in titles</label>
              </div>
              <div className="field">
                <label>Most hashtags per post</label>
                <input type="number" min={0} max={30} value={maxHashtags} onChange={(e) => setMaxHashtags(Number(e.target.value))} />
              </div>
            </div>
          </section>

          <section className="setup-card">
            <h3>Posting schedule</h3>
            <p className="hint">When clips should go out. Times are HH:mm, 24-hour.</p>
            <div className="row-2">
              <div className="field">
                <label>Audience timezone <span className="sub">(where your viewers are)</span></label>
                <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
              </div>
              <div className="field">
                <label>Your timezone <span className="sub">(where you are)</span></label>
                <input type="text" value={operatorTimezone} onChange={(e) => setOperatorTimezone(e.target.value)} placeholder="UTC" />
              </div>
            </div>
            <div className="row-2">
              <div className="field">
                <label>Post times <span className="sub">(in the audience timezone, comma-separated)</span></label>
                <input type="text" value={slots} onChange={(e) => setSlots(e.target.value)} placeholder="12:00, 19:00" />
              </div>
              <div className="field">
                <label>Posts per day</label>
                <input type="number" min={1} max={10} value={dailyClips} onChange={(e) => setDailyClips(Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>
      </div>

      {toast && <div className={`toast${toast.ok ? '' : ' error'}`}>{toast.text}</div>}
    </div>
  );
}

/** Capitalize a provider id for display ("gemini" -> "Gemini"). */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Status pill for a connection row. */
function ConnPill({ state, label }: { state: 'ok' | 'warn' | 'off' | 'wait' | 'info'; label: string }) {
  return <span className={`conn-pill ${state}`}>{label}</span>;
}
