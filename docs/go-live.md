# Go-live — launch strategy, schedule & what to know before you post

> The strategy + checklist to read **before your first post**. The daily mechanics
> (buttons, commands) are in [operator-guide.md](./operator-guide.md); this is the
> *why*, the *when*, and the *what-to-watch*.

---

## 1. Ride your niche's momentum

Every niche has a rhythm — a product launch, a season, a release window, an event,
or just steady ongoing news. Your edge is being a **steady, already-running
channel** when attention in your niche peaks, not spinning up cold the day it does.

If your subject has a **tentpole moment** (a launch/event/season), think in three
phases:

| Phase | Goal |
|-------|------|
| **A — Countdown** | Build a back-catalog + prime the algorithm so you're not a brand-new channel when the spike hits. Volume + consistency matter more than any single viral hit. |
| **B — Spike window** | Ride the peak. React fast to real, current facts. This is where the views are. |
| **C — After** | Shift from "hype" to "news + tips + reactions." Lean into what the metrics say worked. |

If your niche has no single tentpole, you're effectively always in Phase C:
consistency + metrics-driven iteration.

---

## 2. Phase A — the countdown (building runway)

- **Post every single day, no gaps.** Consistency is the strongest signal you can
  send a new channel. At 2/day that compounds into real runway before the spike.
- **Vary the angle.** Explainers, breakdowns, "things you missed," rumor-vs-confirmed.
  The generator tags angle type — let it vary, then let the metrics pick winners (§5).
- **Front-load urgency when you have it.** If there's a countdown, a visible "N days
  left" frame rides the built-in urgency.
- **Don't blow your best material too early.** Keep 2–3 of your strongest scripts in
  the approved buffer for the highest-traffic days.

## 3. Phase B — the spike window

- **Be live and current.** When attention peaks, real facts replace rumors fast.
  Your whitelist-first sourcing surfaces the confirmed stuff — approve the freshest,
  most concrete facts first.
- **Consider bumping cadence** during the spike (more at-bats when demand peaks).
  Trade-off: more voiceover spend + more review time. It's a one-line config change
  (`dailyClips` in the channel's publish config / the wizard).
- **Reaction speed beats polish.** A clip about something that happened *today*
  outperforms a perfectly produced evergreen one during a news spike.

## 4. Phase C — steady state

- After a spike, attention settles into a long tail (updates, follow-on news, tips).
- **Switch the content mix** toward evergreen + news-reaction. Your §5 metrics will
  tell you which angles and hooks earn retention — pivot toward those, drop the rest.
- Keep the daily cadence. Channels that go quiet lose the ranking they built.

---

## 5. How to track what's working (already built — use it)

You don't have to guess. The ideation app has a **performance-feedback loop**
(ADR-020) that aggregates every clip you log into buckets.

**What's tracked** — for each posted clip you record its numbers, and the dashboard
aggregates performance **by angle type, by hook opener, and by confidence tier**.
Each bucket shows: sample size, **avg views, avg retention %, avg engagement rate,
and a 0–1 blended score**.

**Your weekly loop:**

1. After a clip has ~48h of data, open YouTube Studio / Instagram Insights and read
   off: views, **average view duration / retention %**, likes, comments, shares,
   subscribers gained.
2. Record it on the dashboard (**Performance** → add/update the post), or via
   `POST /metrics/posts` then `PATCH /metrics/posts/:id`.
3. Read the **Insights**. Once there's "enough data," it tells you which **angle**
   and which **hook opener** actually retain viewers — and that signal feeds back
   into the generator's hook scoring + angle selection.
4. **Act on it:** approve more of what scores high, stop approving what doesn't.

The single most important number is **retention %** — the YouTube Shorts and Reels
algorithms both distribute almost entirely on *how long people watch*. A clip that
holds attention in the **first 3 seconds** and keeps it gets pushed; a clever script
that loses people early gets capped. Judge hooks by the retention curve, not by how
good they sound.

> Also keep the manual log in [operations.md](./operations.md#metrics-to-log) going
> for anything the dashboard doesn't capture (background used, post time, etc.).

---

## 6. The schedule — what time, and how it actually works

**You never stay up for a slot in another timezone.** You upload in a comfortable
batch in your own evening, set each platform's **own native scheduler** to the slot
time, and the platforms post it while you sleep. Telegram shows each clip's slot
time already converted to your timezone.

**Method, not fixed numbers:** aim for **one midday + one evening** window in your
target market's timezone (set `timezone` + `slots` in the wizard). Covering a midday
and an evening peak beats clustering two posts a few hours apart.

**Where the native scheduler lives:**
- **YouTube:** YouTube Studio → upload → **Visibility → Schedule** → set date/time.
  Studio schedules in *your* account timezone — enter the value in the timezone the
  Telegram bubble shows for you, and double-check the account tz in Studio settings.
- **Instagram:** only a **Professional (Business/Creator)** account can schedule
  natively — in the Instagram app (**Advanced settings → Schedule**) or via **Meta
  Business Suite → Planner**. Enter the time in the tz the tool shows.

**Important:** treat these times as a **starting hypothesis**. After ~a week, open
your own Studio/Insights "when your viewers are online" data and move the slots to
your real audience peak (set them in the wizard).

---

## 7. Pre-flight checklist — before your very first post

Clearance (from [operations.md](./operations.md), non-negotiable):
- [ ] Channel + video descriptions carry the independent-channel disclaimer (set it
      as the wizard's branding footer).
- [ ] Channel and every video marked **"not made for kids"** (unless your subject
      genuinely targets children).
- [ ] YouTube **altered/synthetic content** disclosure enabled (the voiceover is AI).
- [ ] Background footage cleared + muted; **zero** copyrighted assets/logos/title art
      of the subject.
- [ ] Music (when added) from the YouTube Audio Library.

Accounts/setup:
- [ ] Instagram is a **Professional** account linked to a Facebook Page (needed to
      schedule, and for later API posting).
- [ ] Handle consistent on both platforms.
- [ ] Telegram bot reaching you (test a render → you got the clip + can reply
      `Scheduled`).

Operational:
- [ ] Channel configured in the **`/setup` wizard** (subject, sources, branding, cadence).
- [ ] Background clip pool ingested.
- [ ] Your voiceover provider key funded (each new render spends it; a Redo reuses
      the cached voiceover for free).
- [ ] You've done one full real cycle end-to-end before relying on it daily.

---

## 8. First-week test plan (turn guesses into data)

1. Days 1–7: post at your chosen slots, **log every clip's 48h numbers** (§5).
2. Vary the angle/hook — don't post 7 of the same thing.
3. End of week 1: open the **Insights** + your Studio "viewers online" chart.
4. Adjust two things only: **slot times** (to your real peak) and **content mix**
   (toward the highest-retention angle). Change one variable at a time.

---

## Sources

- [Best time to post YouTube Shorts 2026 (SocialPilot)](https://www.socialpilot.co/?p=504633)
- [Best time to post on YouTube by niche/timezone (UniLink)](https://app.unil.ink/blog/best-time-to-post-on-youtube)
- [Best time to post Instagram Reels 2026 (Fliki)](https://fliki.ai/blog/best-time-to-post-reels-on-instagram)
- [Best times to post on Instagram 2026 (Sprout Social)](https://sproutsocial.com/insights/best-times-to-post-on-Instagram)
- [YouTube Shorts best practices 2026 (JoinBrands)](https://joinbrands.com/blog/youtube-shorts-best-practices/)
- [YouTube Shorts growth — retention & hooks (wpreset)](https://wpreset.com/how-to-grow-faster-on-youtube-in-2026-shorts-strategy-click-through-rate-and-watch-time-optimization/)
