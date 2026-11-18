import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A single inbound Telegram update we care about (a text reply). */
export interface TelegramReply {
  updateId: number;
  chatId: string;
  text: string;
  /** message_id this text was a reply to, if any (used to match the task). */
  replyToMessageId?: number;
}

const API = 'https://api.telegram.org';
const CAPTION_LIMIT = 1024;
const MESSAGE_LIMIT = 4096;
/** Abort a request rather than let one hung call freeze the publish sweep (ADR-033). */
const REQUEST_TIMEOUT_MS = 30_000;
/**
 * File uploads get a long leash: a 30-50 MB Short on a slow home uplink can take
 * minutes. Too short an abort makes us treat an upload Telegram actually received
 * as a failure and re-send it (the duplicate-clip bug), so this is generous.
 * (Telegram's Bot API still caps a bot's file upload at 50 MB.)
 */
const UPLOAD_TIMEOUT_MS = 300_000;

/**
 * Thin Telegram Bot API client (Phase 4, ADR-033). Outbound only needs the HTTP
 * API — no server, no webhook. Inbound uses short-poll `getUpdates`. The bot
 * token + chat id come from env (never logged); with no token the service is a
 * safe no-op so the app still boots (mirrors the lazy-LLM/ElevenLabs handling).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;
  private warned = false;

  constructor(config: ConfigService) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN')?.trim() || undefined;
    this.chatId = config.get<string>('TELEGRAM_CHAT_ID')?.trim() || undefined;
  }

  /** True when a bot token is configured. */
  get enabled(): boolean {
    return Boolean(this.token);
  }

  /** The configured default chat id (env), if any. */
  get defaultChatId(): string | undefined {
    return this.chatId;
  }

  private missing(): boolean {
    if (this.token) return false;
    if (!this.warned) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — publish notifications disabled');
      this.warned = true;
    }
    return true;
  }

  private async call<T>(method: string, body: unknown): Promise<T | null> {
    if (this.missing()) return null;
    try {
      const res = await fetch(`${API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!json.ok) {
        this.logger.error(`telegram ${method} failed: ${json.description ?? res.status}`);
        return null;
      }
      return json.result ?? null;
    } catch (err) {
      this.logger.error(`telegram ${method} error: ${String(err)}`);
      return null;
    }
  }

  /** Send a text message; returns the message_id (for reply matching). */
  async sendMessage(chatId: string, text: string): Promise<number | null> {
    const res = await this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, MESSAGE_LIMIT),
      disable_web_page_preview: true,
    });
    return res?.message_id ?? null;
  }

  /** Upload a local video file with a short caption; returns the message_id. */
  async sendVideo(chatId: string, filePath: string, caption: string): Promise<number | null> {
    if (this.missing()) return null;
    try {
      const buf = await readFile(filePath);
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption.slice(0, CAPTION_LIMIT));
      form.append(
        'video',
        new Blob([new Uint8Array(buf)], { type: 'video/mp4' }),
        basename(filePath),
      );
      const res = await fetch(`${API}/bot${this.token}/sendVideo`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const json = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
      if (!json.ok) {
        this.logger.error(`telegram sendVideo failed: ${json.description ?? res.status}`);
        return null;
      }
      return json.result?.message_id ?? null;
    } catch (err) {
      this.logger.error(`telegram sendVideo error: ${String(err)}`);
      return null;
    }
  }

  /** Upload a local image as a photo. */
  async sendPhoto(chatId: string, filePath: string, caption = ''): Promise<number | null> {
    if (this.missing()) return null;
    try {
      const buf = await readFile(filePath);
      const form = new FormData();
      form.append('chat_id', chatId);
      if (caption) form.append('caption', caption.slice(0, CAPTION_LIMIT));
      form.append(
        'photo',
        new Blob([new Uint8Array(buf)], { type: 'image/png' }),
        basename(filePath),
      );
      const res = await fetch(`${API}/bot${this.token}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const json = (await res.json()) as { ok: boolean; result?: { message_id: number } };
      return json.ok ? json.result?.message_id ?? null : null;
    } catch (err) {
      this.logger.error(`telegram sendPhoto error: ${String(err)}`);
      return null;
    }
  }

  /**
   * Fetch inbound updates since `offset` (short poll). Returns the text replies
   * and the highest updateId seen (to persist as the next offset).
   */
  async getUpdates(offset: number): Promise<{ replies: TelegramReply[]; lastUpdateId: number }> {
    const empty = { replies: [], lastUpdateId: offset - 1 };
    if (this.missing()) return empty;
    const res = await this.call<
      Array<{
        update_id: number;
        message?: {
          text?: string;
          chat: { id: number };
          reply_to_message?: { message_id: number };
        };
      }>
    >('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
    if (!res) return empty;

    const replies: TelegramReply[] = [];
    let last = offset - 1;
    for (const u of res) {
      last = Math.max(last, u.update_id);
      const msg = u.message;
      if (msg?.text) {
        replies.push({
          updateId: u.update_id,
          chatId: String(msg.chat.id),
          text: msg.text,
          replyToMessageId: msg.reply_to_message?.message_id,
        });
      }
    }
    return { replies, lastUpdateId: last };
  }
}
