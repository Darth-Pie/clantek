/**
 * Discord Gateway listener — a Durable Object holding a single persistent
 * websocket to Discord so the bot can see chat activity and feed the profile
 * activity heatmap (memberActivity, source 'discord').
 *
 * Why a Durable Object: a plain Worker can't hold a long-lived connection, and
 * the Gateway requires a heartbeat every ~41s. The DO keeps the socket and uses
 * an ALARM as the heartbeat clock. When the DO is evicted the socket dies, but
 * the durable alarm wakes it again and it RESUMEs — Discord replays every event
 * after the last sequence number, so messages sent during the gap are still
 * counted. That "resume recovers the gap" property is what makes a best-effort
 * heatmap workable on Workers.
 *
 * We only need presence-of-activity per day, so:
 *   - intents are GUILDS | GUILD_MESSAGES (no privileged MESSAGE_CONTENT — we
 *     never read message text, only that a member posted), and
 *   - each (member, day) is recorded at most once (a dedupe table in DO storage
 *     survives eviction, so a resume-replay doesn't double count).
 *
 * Boot/keepalive: the 5-minute cron calls start() as a backstop; steady-state
 * heartbeats and reconnects are driven by the DO's own alarm. Nothing connects
 * until an admin turns on "Track Discord chat activity" (attendance config) and
 * a bot token + guild are configured.
 */

import { DurableObject } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import * as s from '../../db/schema';
import type { Env } from '../env';
import { loadConfig } from '../config';
import { loadAttendanceConfig } from '../attendance';
import { recordActivity } from '../attendance';
import { unixDay } from '../../shared/attendance';

const DEFAULT_GATEWAY = 'wss://gateway.discord.gg';
const API_QUERY = '?v=10&encoding=json';
// GUILDS (1<<0) | GUILD_MESSAGES (1<<9). Neither is a privileged intent.
const INTENTS = (1 << 0) | (1 << 9);

// Gateway opcodes.
const Op = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export class DiscordGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null;
  private heartbeatMs = 41250;
  private lastAck = true;
  private token: string | null = null;
  private guildId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS seen (discord_id TEXT NOT NULL, day INTEGER NOT NULL, PRIMARY KEY (discord_id, day))`,
      );
    });
  }

  /** Ensure a connection exists (called by the cron and on demand). No-op if
   *  the feature is off or the bot isn't configured. */
  async start(): Promise<void> {
    const db = drizzle(this.env.DB, { schema });
    const attendance = await loadAttendanceConfig(this.env, db);
    if (!attendance.discordActivity) {
      // Feature turned off — tear down any live socket and stop heartbeating.
      await this.stop();
      return;
    }
    const cfg = await loadConfig(this.env, db);
    this.token = cfg.discord.botToken || null;
    this.guildId = cfg.discord.guildId || null;
    if (!this.token || !this.guildId) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) return; // already connected
    await this.openSocket();
  }

  /** Close the socket and cancel the heartbeat. */
  async stop(): Promise<void> {
    try {
      this.ws?.close(1000);
    } catch {
      /* already gone */
    }
    this.ws = null;
    await this.ctx.storage.deleteAlarm();
  }

  private async openSocket(): Promise<void> {
    if (!this.token) {
      const cfg = await loadConfig(this.env, drizzle(this.env.DB, { schema }));
      this.token = cfg.discord.botToken || null;
      this.guildId = cfg.discord.guildId || null;
      if (!this.token || !this.guildId) return;
    }
    const sessionId = await this.ctx.storage.get<string>('sessionId');
    const resumeUrl = await this.ctx.storage.get<string>('resumeUrl');
    const base = sessionId && resumeUrl ? resumeUrl : DEFAULT_GATEWAY;
    let resp: Response;
    try {
      resp = await fetch(`${base}${API_QUERY}`, { headers: { Upgrade: 'websocket' } });
    } catch (err) {
      console.error('Gateway connect failed', err);
      return;
    }
    const ws = resp.webSocket;
    if (!ws) {
      console.error('Gateway did not return a websocket', resp.status);
      return;
    }
    ws.accept();
    this.ws = ws;
    this.lastAck = true;
    ws.addEventListener('message', (ev) => {
      this.onMessage(typeof ev.data === 'string' ? ev.data : '').catch((err) => console.error('Gateway message error', err));
    });
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
    });
    ws.addEventListener('error', () => {
      if (this.ws === ws) this.ws = null;
    });
  }

  private send(payload: unknown): void {
    try {
      this.ws?.send(JSON.stringify(payload));
    } catch {
      /* socket died mid-send; the alarm will reconnect */
    }
  }

  private identify(): void {
    this.send({
      op: Op.IDENTIFY,
      d: {
        token: this.token,
        intents: INTENTS,
        properties: { os: 'cloudflare', browser: 'mustr', device: 'mustr' },
      },
    });
  }

  private async resume(): Promise<void> {
    const sessionId = await this.ctx.storage.get<string>('sessionId');
    const seq = await this.ctx.storage.get<number>('seq');
    this.send({ op: Op.RESUME, d: { token: this.token, session_id: sessionId, seq: seq ?? null } });
  }

  private async onMessage(raw: string): Promise<void> {
    if (!raw) return;
    const payload = JSON.parse(raw) as { op: number; d: unknown; s: number | null; t: string | null };
    if (typeof payload.s === 'number') await this.ctx.storage.put('seq', payload.s);

    switch (payload.op) {
      case Op.HELLO: {
        this.heartbeatMs = (payload.d as { heartbeat_interval: number }).heartbeat_interval || 41250;
        const sessionId = await this.ctx.storage.get<string>('sessionId');
        const seq = await this.ctx.storage.get<number>('seq');
        if (sessionId && seq != null) await this.resume();
        else this.identify();
        this.lastAck = true;
        await this.ctx.storage.setAlarm(Date.now() + this.heartbeatMs);
        break;
      }
      case Op.DISPATCH: {
        const t = payload.t;
        if (t === 'READY') {
          const d = payload.d as { session_id: string; resume_gateway_url: string };
          await this.ctx.storage.put('sessionId', d.session_id);
          await this.ctx.storage.put('resumeUrl', d.resume_gateway_url);
        } else if (t === 'MESSAGE_CREATE') {
          await this.onMessageCreate(payload.d as MessageCreate);
        }
        break;
      }
      case Op.HEARTBEAT: {
        // Discord asked for an immediate heartbeat.
        this.sendHeartbeat();
        break;
      }
      case Op.RECONNECT: {
        await this.reconnect(true);
        break;
      }
      case Op.INVALID_SESSION: {
        // Can't resume — drop the session and start fresh.
        await this.ctx.storage.delete('sessionId');
        await this.ctx.storage.delete('resumeUrl');
        await this.ctx.storage.delete('seq');
        await this.reconnect(false);
        break;
      }
      case Op.HEARTBEAT_ACK: {
        this.lastAck = true;
        break;
      }
    }
  }

  private sendHeartbeat(): void {
    void this.ctx.storage.get<number>('seq').then((seq) => {
      this.lastAck = false;
      this.send({ op: Op.HEARTBEAT, d: seq ?? null });
    });
  }

  private async reconnect(resumable: boolean): Promise<void> {
    try {
      this.ws?.close(resumable ? 4000 : 1000);
    } catch {
      /* ignore */
    }
    this.ws = null;
    await this.openSocket();
  }

  /** The heartbeat clock. Also the reconnect watchdog and keepalive. */
  async alarm(): Promise<void> {
    // Re-check the feature flag so turning it off eventually stops the socket.
    const db = drizzle(this.env.DB, { schema });
    const attendance = await loadAttendanceConfig(this.env, db);
    if (!attendance.discordActivity) {
      await this.stop();
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.openSocket();
    } else if (!this.lastAck) {
      // Missed the previous ACK — the connection is a zombie. Reconnect+resume.
      await this.reconnect(true);
    } else {
      const seq = await this.ctx.storage.get<number>('seq');
      this.lastAck = false;
      this.send({ op: Op.HEARTBEAT, d: seq ?? null });
    }
    await this.ctx.storage.setAlarm(Date.now() + this.heartbeatMs);
  }

  private async onMessageCreate(d: MessageCreate): Promise<void> {
    if (!this.guildId || d.guild_id !== this.guildId) return;
    if (d.author?.bot) return;
    const discordId = d.author?.id;
    if (!discordId) return;

    const day = unixDay(Math.floor(Date.now() / 1000));
    // Record each member at most once per day (survives eviction + resume replay).
    const already = this.ctx.storage.sql
      .exec('SELECT 1 FROM seen WHERE discord_id = ? AND day = ? LIMIT 1', discordId, day)
      .toArray();
    if (already.length) return;
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO seen (discord_id, day) VALUES (?, ?)', discordId, day);

    const db = drizzle(this.env.DB, { schema });
    const user = await db.query.users.findFirst({
      where: eq(s.users.discordId, discordId),
      columns: { id: true },
    });
    if (!user) return;
    await recordActivity(db, user.id, 'discord', { day }).catch(() => {});
  }
}

interface MessageCreate {
  guild_id?: string;
  author?: { id: string; bot?: boolean };
}
