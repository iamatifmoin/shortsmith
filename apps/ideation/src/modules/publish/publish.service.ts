import { stat, unlink } from 'node:fs/promises';

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PublishStatus as DbPublishStatus } from '@prisma/client';
import { Platform, PublishStatus, PublishTaskView, ScriptClaim } from '@shortsmith/shared';

import { publishConfigFor } from '../../config/publishing';
import { PrismaService } from '../../prisma/prisma.service';
import { RenderService } from '../render/render.service';
import { buildCopyBlocks, PublishDefaults } from './publish-copy';
import {
  nextOpenSlot,
  prevDateKey,
  slotMeta,
  slotTimes,
  zoneDateKey,
  zoneDateLabel,
  zoneHhmm,
} from './slots';
import { PublishConfig } from '../../config/publishing';
import { TelegramService } from './telegram.service';

/** AppState key for the Telegram getUpdates offset. */
const OFFSET_KEY = 'telegram.updateOffset';
/** AppState key for the auto-discovered chat id (when env TELEGRAM_CHAT_ID is unset). */
const CHAT_KEY = 'telegram.chatId';

const TICK_MS = 15_000; // sweep cadence
const REMIND_EVERY_MS = 60 * 60 * 1000; // at most one evening nudge per hour
/** Telegram caps a bot's file upload at 50 MB; keep a margin. An oversized clip
 * can never send, so it's skipped (not held) and the operator is told to Redo it. */
const MAX_TELEGRAM_UPLOAD = 49 * 1024 * 1024;

/** AppState keys for the once-per-day digest messages (so they don't repeat). */
const BRIEFING_KEY = 'digest.briefingDate';
const REMINDER_KEY = 'digest.reminderAt';
const COMPLETE_KEY = 'digest.completeDate';

/** Statuses of a PublishTask still occupying a slot. */
const LIVE: DbPublishStatus[] = ['READY', 'NOTIFIED', 'SCHEDULED'];

/**
 * Owns the Phase-4 publish queue (ADR-032). A single sweep, run on a timer (and
 * once at startup for catch-up), does everything: turn DONE renders into slot-
 * assigned PublishTasks, push them to Telegram, poll for the operator's
 * `Scheduled` reply, and send slot reminders. It depends on RenderService one way
 * (for Redo/Reject) — it never calls back into render, so there's no cycle; the
 * DONE->task step is a DB sweep, not a render callback.
 */
@Injectable()
export class PublishService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;
  /** Tasks already flagged to the operator as too big to send (alert once per run). */
  private readonly oversizeAlerted = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly render: RenderService,
  ) {}

  onModuleInit(): void {
    // Catch-up immediately, then on a timer. unref() so the sweep never holds the
    // process open on its own.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One sweep. Each step is isolated so a failure in one doesn't skip the rest. */
  async tick(): Promise<void> {
    if (this.ticking) return; // never overlap sweeps
    this.ticking = true;
    try {
      await this.createTasksForDoneRenders().catch((e) => this.logger.error(`createTasks: ${e}`));
      await this.notifyReadyTasks().catch((e) => this.logger.error(`notify: ${e}`));
      await this.pollReplies().catch((e) => this.logger.error(`poll: ${e}`));
      await this.sendDailyDigest().catch((e) => this.logger.error(`digest: ${e}`));
    } finally {
      this.ticking = false;
    }
  }

  // --- Sweep steps --------------------------------------------------------

  /** DONE renders without a task become slot-assigned PublishTasks (FIFO). */
  private async createTasksForDoneRenders(): Promise<void> {
    const done = await this.prisma.renderJob.findMany({
      where: { status: 'DONE', publishTask: { is: null } },
      orderBy: { finishedAt: 'asc' },
      include: { script: { include: { series: true } } },
    });
    if (done.length === 0) return;

    const takenMs = await this.takenSlotMs();
    for (const job of done) {
      // A render whose script was since rejected (e.g. Reject-clip) gets no task.
      if (job.script.status !== 'APPROVED') continue;
      const cfg = publishConfigFor(job.script.series.publishConfig);
      const slot = nextOpenSlot(cfg, takenMs);
      takenMs.add(slot.getTime());
      await this.prisma.publishTask.create({
        data: { scriptId: job.scriptId, renderJobId: job.id, slotAt: slot },
      });
      this.logger.log(`publish task for script ${job.scriptId} @ ${slot.toISOString()}`);
    }
  }

  /** READY tasks are pushed to Telegram (video + thumb + copy blocks) -> NOTIFIED. */
  private async notifyReadyTasks(): Promise<void> {
    if (!this.telegram.enabled) return;
    const chatId = await this.resolveChatId();
    if (!chatId) return; // no chat yet — message the bot once; we learn it on poll

    const ready = await this.prisma.publishTask.findMany({
      where: { status: 'READY' },
      orderBy: { slotAt: 'asc' },
      include: {
        renderJob: true,
        script: { include: { series: true } },
      },
    });

    for (const task of ready) {
      const { script, renderJob } = task;
      const videoPath = renderJob.videoPath;
      // A READY task is always backed by a finished render. If the video path is
      // somehow missing, hold the queue rather than send a later clip ahead of it.
      if (!videoPath) {
        this.logger.warn(`notify: task ${task.id} has no video yet — holding the queue`);
        return;
      }
      // An oversized clip can never upload (Telegram's 50 MB bot cap). Skip it —
      // don't hold the deliverable clips behind it — and tell the operator once to
      // Redo it (the render now targets a smaller file, so a Redo fixes it).
      const bytes = (await stat(videoPath).catch(() => ({ size: 0 }))).size;
      if (bytes > MAX_TELEGRAM_UPLOAD) {
        if (!this.oversizeAlerted.has(task.id)) {
          this.oversizeAlerted.add(task.id);
          const mb = Math.round(bytes / (1024 * 1024));
          this.logger.error(
            `notify: task ${task.id} video ${mb}MB exceeds Telegram's 50MB limit — skipping; Redo it`,
          );
          await this.telegram
            .sendMessage(
              chatId,
              `⚠️ A rendered clip is ${mb} MB — over Telegram's 50 MB limit, so it couldn't be sent. ` +
                `Open the dashboard and hit Redo on that clip to re-render a smaller one.`,
            )
            .catch(() => undefined);
        }
        continue;
      }
      const cfg = publishConfigFor(script.series.publishConfig);
      const slot = slotTimes(task.slotAt.toISOString(), cfg);
      const claims = (script.claims as unknown as ScriptClaim[]) ?? [];
      const defaults = (script.series.publishDefaults as PublishDefaults | null) ?? {};
      const blocks = buildCopyBlocks({
        hook: script.hook,
        cta: script.cta,
        publish: (script.publishPackage as never) ?? null,
        defaults,
        slot,
        sourceUrl: claims[0]?.sourceUrl,
      });

      const { clipNo, dateLabel } = slotMeta(task.slotAt.toISOString(), cfg);
      const label = `Clip ${clipNo} · ${dateLabel}`;
      const caption =
        `🎬 ${label} — clip ready\n` +
        `🕒 Post at ${slot.byZone['You (IST)']} your time (${slot.byZone['US (ET)']} ET)\n` +
        `Reply "Scheduled" here once you've scheduled it.`;

      // The clip's messages in the exact order the operator should see them: the
      // video first (it anchors the "Scheduled" reply), then the thumbnail, then a
      // short label bubble + a copy-this bubble per upload field.
      const yt = blocks.youtube;
      const steps: Array<{ what: string; run: () => Promise<number | null> }> = [
        { what: 'video', run: () => this.telegram.sendVideo(chatId, videoPath, caption) },
      ];
      if (renderJob.thumbnailPath) {
        const thumb = renderJob.thumbnailPath;
        steps.push({ what: 'thumbnail', run: () => this.telegram.sendPhoto(chatId, thumb, `🖼️ Thumbnail for ${label}`) });
      }
      const fields: Array<[string, string]> = [
        ['▶️ YouTube title', yt.title],
        ['▶️ YouTube description', yt.description],
        ['▶️ YouTube tags', yt.tags.join(', ')],
        ['📸 Instagram caption', blocks.instagram.caption],
      ];
      for (const [name, value] of fields) {
        if (!value) continue;
        steps.push({ what: `${name} label`, run: () => this.telegram.sendMessage(chatId, name) });
        steps.push({ what: `${name} value`, run: () => this.telegram.sendMessage(chatId, value) });
      }

      // Exactly-once + in-order delivery. Resume after the messages already sent for
      // this task (we persist the running id list after EVERY message), and stop at
      // the first failure. Nothing is ever re-sent — not even the cheap bubbles — and
      // because we return on any incomplete clip, a later clip never jumps ahead of
      // an earlier one. The video, being step 0, is likewise uploaded at most once.
      const ids = (task.telegramMessageId ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      for (let i = ids.length; i < steps.length; i++) {
        const id = await steps[i].run();
        if (!id) {
          this.logger.warn(`notify: "${steps[i].what}" failed for task ${task.id} — resuming next sweep`);
          return; // hold the queue so clips arrive strictly in order
        }
        ids.push(id);
        await this.prisma.publishTask.update({
          where: { id: task.id },
          data: { telegramChatId: chatId, telegramMessageId: ids.join(',') },
        });
      }

      await this.prisma.publishTask.update({
        where: { id: task.id },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      });
      this.logger.log(`notified task ${task.id} (messages ${ids.join(',')})`);
    }
  }

  /** Poll inbound replies; a `Scheduled` reply to a task's message schedules it. */
  private async pollReplies(): Promise<void> {
    if (!this.telegram.enabled) return;
    const offset = Number((await this.getState(OFFSET_KEY)) ?? '0');
    const { replies, lastUpdateId } = await this.telegram.getUpdates(offset);

    for (const r of replies) {
      // Learn the operator's chat id from their first message (setup convenience).
      if (!this.telegram.defaultChatId) await this.setState(CHAT_KEY, r.chatId);
      if (!/\bscheduled\b/i.test(r.text)) continue;
      if (!r.replyToMessageId) {
        this.logger.warn('`Scheduled` received but not a reply to a clip message — ignoring');
        continue;
      }
      const task = await this.findTaskByMessageId(r.replyToMessageId);
      if (!task) {
        this.logger.warn(`no task matches replied message ${r.replyToMessageId}`);
        continue;
      }
      await this.markScheduled(task.id, 'telegram');
    }

    if (lastUpdateId >= offset) await this.setState(OFFSET_KEY, String(lastUpdateId + 1));
  }

  /**
   * Once-a-day digest in the operator's own timezone (ADR-033): a "fresh slate"
   * briefing at the start of their day, and an evening nudge if clips are still
   * waiting to be scheduled. The day-complete + streak message is event-driven
   * from {@link markScheduled}. Digest *timing* uses the operator's local day,
   * but "a day's clips" are grouped by the clip's POSTING day (its slot's date),
   * so pre-scheduling a future slot in tonight's batch never marks today done.
   */
  private async sendDailyDigest(): Promise<void> {
    if (!this.telegram.enabled) return;
    const chatId = await this.resolveChatId();
    if (!chatId) return;
    const cfg = await this.primaryConfig();
    const now = new Date();
    const tz = cfg.operatorTimezone;
    const todayKey = zoneDateKey(now, tz);
    const nowHhmm = zoneHhmm(now, tz);

    // New-day briefing (variation A): first tick past briefingTime each day.
    if (nowHhmm >= cfg.briefingTime && (await this.getState(BRIEFING_KEY)) !== todayKey) {
      const { counts } = await this.scheduledDayCounts(cfg);
      // Show progress for the posting day being worked on: the earliest slot day
      // that still has a clip waiting to be scheduled, else the current day.
      const pending = await this.prisma.publishTask.findFirst({
        where: { status: { in: ['READY', 'NOTIFIED'] } },
        orderBy: { slotAt: 'asc' },
        select: { slotAt: true },
      });
      const dayDate = pending?.slotAt ?? now;
      const done = counts.get(zoneDateKey(dayDate, cfg.timezone)) ?? 0;
      await this.telegram.sendMessage(
        chatId,
        `🌅 New day — ${done} of ${cfg.dailyClips} clips scheduled for ${zoneDateLabel(dayDate, cfg.timezone)}.\n` +
          `Open the dashboard → Fetch → Render when you're ready.`,
      );
      await this.setState(BRIEFING_KEY, todayKey);
    }

    // Evening nudge: after reminderTime, hourly, only while clips await scheduling.
    if (nowHhmm >= cfg.reminderTime) {
      const waiting = await this.prisma.publishTask.count({ where: { status: 'NOTIFIED' } });
      const lastAt = Number((await this.getState(REMINDER_KEY)) ?? '0');
      if (waiting > 0 && Date.now() - lastAt >= REMIND_EVERY_MS) {
        await this.telegram.sendMessage(
          chatId,
          `⏰ You have ${waiting} clip${waiting === 1 ? '' : 's'} rendered and waiting to schedule today. ` +
            `Schedule ${waiting === 1 ? 'it' : 'them'} on YouTube + Instagram, then reply "Scheduled" to each.`,
        );
        await this.setState(REMINDER_KEY, String(Date.now()));
      }
    }
  }

  /**
   * Scheduled-clip counts per POSTING day (the slot's calendar day in the target
   * timezone), and which of those days have all `dailyClips` clips scheduled.
   * Keyed by the slot day — not by when the operator clicked "Scheduled" — so
   * pre-scheduling tomorrow's slot in tonight's batch can't mark today complete.
   */
  private async scheduledDayCounts(
    cfg: PublishConfig,
  ): Promise<{ keys: Set<string>; counts: Map<string, number> }> {
    const rows = await this.prisma.publishTask.findMany({
      where: { status: 'SCHEDULED' },
      select: { slotAt: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = zoneDateKey(r.slotAt, cfg.timezone);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const keys = new Set([...counts].filter(([, c]) => c >= cfg.dailyClips).map(([k]) => k));
    return { keys, counts };
  }

  /** Consecutive complete days ending at (and including) `endKey`. */
  private streakEndingAt(completeDays: Set<string>, endKey: string): number {
    let n = 0;
    let cur = endKey;
    while (completeDays.has(cur)) {
      n += 1;
      cur = prevDateKey(cur);
    }
    return n;
  }

  /** Publish config for the first active series (digest timing is operator-level). */
  private async primaryConfig(): Promise<PublishConfig> {
    const series = await this.prisma.series.findFirst({ where: { active: true } });
    return publishConfigFor(series?.publishConfig);
  }

  // --- Gate-2 / dashboard actions ----------------------------------------

  /** Active publish tasks for the Gate-2 board (newest slot activity first). */
  async listTasks(limit = 50): Promise<PublishTaskView[]> {
    const tasks = await this.prisma.publishTask.findMany({
      where: { status: { in: LIVE } },
      orderBy: { slotAt: 'asc' },
      take: limit,
      include: { renderJob: true, script: { include: { series: true } } },
    });
    return tasks.map((t) => {
      const cfg = publishConfigFor(t.script.series.publishConfig);
      return {
        id: t.id,
        scriptId: t.scriptId,
        renderJobId: t.renderJobId,
        status: t.status as unknown as PublishStatus,
        slot: slotTimes(t.slotAt.toISOString(), cfg),
        hook: t.script.hook,
        videoPath: t.renderJob.videoPath,
        thumbnailPath: t.renderJob.thumbnailPath,
        notifiedAt: t.notifiedAt?.toISOString() ?? null,
        scheduledAt: t.scheduledAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      } satisfies PublishTaskView;
    });
  }

  /** Mark a task SCHEDULED and create the Post rows for the ADR-020 loop. */
  async markScheduled(taskId: string, via: 'telegram' | 'dashboard'): Promise<void> {
    const task = await this.prisma.publishTask.findUnique({
      where: { id: taskId },
      include: { script: { include: { series: true } } },
    });
    if (!task) throw new NotFoundException(`No publish task ${taskId}`);
    if (task.status === 'SCHEDULED') return; // idempotent
    const now = new Date();
    await this.prisma.publishTask.update({
      where: { id: taskId },
      data: { status: 'SCHEDULED', scheduledAt: now },
    });
    // One Post per platform (ADR-020). Ignore the unique-constraint clash if a row
    // already exists (e.g. operator confirmed twice).
    for (const platform of [Platform.YOUTUBE, Platform.INSTAGRAM]) {
      try {
        await this.prisma.post.create({
          data: { scriptId: task.scriptId, platform, postedAt: task.slotAt },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    // The operator already has the clip from Telegram and it's scheduled on both
    // platforms, so the local render is no longer needed — free the disk (ADR-032).
    await this.cleanupRenderFiles(task.renderJobId);
    this.logger.log(`task ${taskId} SCHEDULED via ${via}`);
    await this.maybeCongratulate(task.script.series.publishConfig, task.slotAt).catch((e) =>
      this.logger.error(`congrats: ${e}`),
    );
  }

  /**
   * When a POSTING day's clips are all scheduled, send the day-complete + streak
   * message once for that day. Keyed off the just-scheduled clip's slot day, so
   * finishing the clip for one posting day never fires for another (e.g. when the
   * operator pre-schedules a future slot in the same batch).
   */
  private async maybeCongratulate(publishConfig: unknown, slotAt: Date): Promise<void> {
    if (!this.telegram.enabled) return;
    const cfg = publishConfigFor(publishConfig);
    const dayKey = zoneDateKey(slotAt, cfg.timezone); // the posting day this clip belongs to
    const { keys, counts } = await this.scheduledDayCounts(cfg);
    if ((counts.get(dayKey) ?? 0) < cfg.dailyClips) return; // that posting day isn't fully scheduled yet
    const done = new Set(((await this.getState(COMPLETE_KEY)) ?? '').split(',').filter(Boolean));
    if (done.has(dayKey)) return; // already congratulated for this posting day
    const chatId = await this.resolveChatId();
    if (!chatId) return;
    const streak = this.streakEndingAt(keys, dayKey);
    await this.telegram.sendMessage(
      chatId,
      `✅ All ${cfg.dailyClips} clips scheduled for the ${zoneDateLabel(slotAt, cfg.timezone)} posting day. You're set.\n` +
        `🔥 ${streak}-day streak.`,
    );
    done.add(dayKey);
    await this.setState(COMPLETE_KEY, [...done].join(','));
  }

  /**
   * Redo a clip: cancel its current task and re-render the SAME script (force), so
   * a fresh take is produced. Reuses the cached voiceover (ADR-034) — no new paid
   * call unless the script text changed.
   */
  async redo(taskId: string): Promise<void> {
    const task = await this.prisma.publishTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`No publish task ${taskId}`);
    await this.prisma.publishTask.update({ where: { id: taskId }, data: { status: 'CANCELLED' } });
    // Drop the take the operator rejected before rendering a fresh one.
    await this.cleanupRenderFiles(task.renderJobId);
    await this.render.enqueue(task.scriptId, { force: true });
    this.logger.log(`redo task ${taskId} -> re-render script ${task.scriptId}`);
  }

  /**
   * Reject a rendered clip: cancel its task, abort any in-flight render, and set
   * the script REJECTED — freeing the slot so another script can take it.
   */
  async rejectClip(taskId: string): Promise<void> {
    const task = await this.prisma.publishTask.findUnique({
      where: { id: taskId },
      include: { script: { select: { angleId: true } } },
    });
    if (!task) throw new NotFoundException(`No publish task ${taskId}`);
    await this.prisma.publishTask.update({ where: { id: taskId }, data: { status: 'CANCELLED' } });
    await this.render.cancel(task.scriptId).catch(() => undefined); // best-effort
    await this.cleanupRenderFiles(task.renderJobId);
    await this.prisma.$transaction([
      this.prisma.script.update({ where: { id: task.scriptId }, data: { status: 'REJECTED' } }),
      this.prisma.angle.update({ where: { id: task.script.angleId }, data: { status: 'REJECTED' } }),
    ]);
    this.logger.log(`reject clip ${taskId} (script ${task.scriptId} REJECTED, slot freed)`);
  }

  /**
   * Delete a render's finished video + thumbnail from disk (ADR-032 cleanup) once
   * it's scheduled or dropped — the limited-disk machine shouldn't hoard clips.
   * Best-effort and idempotent (a missing file is fine). The RenderJob row is kept
   * for the ADR-020 learning loop, with its file paths nulled to show they're gone.
   * The voiceover cache is deliberately NOT touched, so a later Redo stays free.
   */
  private async cleanupRenderFiles(renderJobId: string): Promise<void> {
    const job = await this.prisma.renderJob.findUnique({ where: { id: renderJobId } });
    if (!job) return;
    for (const p of [job.videoPath, job.thumbnailPath]) {
      if (!p) continue;
      try {
        await unlink(p);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT') this.logger.warn(`cleanup ${p}: ${String(err)}`);
      }
    }
    if (job.videoPath || job.thumbnailPath) {
      await this.prisma.renderJob.update({
        where: { id: renderJobId },
        data: { videoPath: null, thumbnailPath: null },
      });
    }
  }

  // --- helpers ------------------------------------------------------------

  private async takenSlotMs(): Promise<Set<number>> {
    const tasks = await this.prisma.publishTask.findMany({
      where: { status: { in: LIVE } },
      select: { slotAt: true },
    });
    return new Set(tasks.map((t) => t.slotAt.getTime()));
  }

  private async findTaskByMessageId(messageId: number) {
    const candidates = await this.prisma.publishTask.findMany({
      where: { status: 'NOTIFIED', telegramMessageId: { not: null } },
    });
    const idStr = String(messageId);
    return candidates.find((t) => (t.telegramMessageId ?? '').split(',').includes(idStr)) ?? null;
  }

  private async resolveChatId(): Promise<string | undefined> {
    return this.telegram.defaultChatId ?? ((await this.getState(CHAT_KEY)) || undefined);
  }

  private async getState(key: string): Promise<string | null> {
    const row = await this.prisma.appState.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  private async setState(key: string, value: string): Promise<void> {
    await this.prisma.appState.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
