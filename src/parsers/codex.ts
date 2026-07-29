import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayEntry, Session } from '../models/session.js';
import { addUsage, finalizeHours, makeDayEntry } from '../models/session.js';
import { toLocalDate, toLocalTime, parseTimestamp } from '../utils/date.js';
import { findJsonlFiles, parseJsonlFileSync } from '../utils/jsonl.js';
import { cleanMessageText, extractText } from '../utils/text.js';

interface CodexMeta {
  sessionId: string;
  cwd: string;
  title: string;
  history: Session['history'];
}

function parseCodexFile(filePath: string): { dayData: Record<string, DayEntry>; meta: CodexMeta } {
  const entries = parseJsonlFileSync(filePath) as Record<string, unknown>[];
  const dayData: Record<string, DayEntry> = {};
  const meta: CodexMeta = { sessionId: '', cwd: '', title: '', history: [] };
  let fallbackDate: string | null = null;
  try { fallbackDate = toLocalDate(fs.statSync(filePath).mtimeMs); } catch {}

  for (const entry of entries) {
    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') continue;

    if (entry.type === 'session_meta') {
      meta.sessionId = String(payload.session_id || '');
      meta.cwd = String(payload.cwd || '');
      continue;
    }

    if (entry.type === 'response_item' && payload.type === 'message') {
      const role = payload.role as string;
      if (role !== 'user' && role !== 'assistant') continue;
      const text = cleanMessageText(extractText(payload));
      if (!text) continue;
      if (!meta.title && role === 'user') meta.title = text.length > 80 ? `${text.substring(0, 77)}...` : text;
      if (meta.history && meta.history.length < 15) {
        meta.history.push({ role: role === 'user' ? 'user' : 'ai', text: text.length > 120 ? `${text.substring(0, 117)}...` : text });
      }
      continue;
    }

    if (entry.type !== 'event_msg' || payload.type !== 'token_count') continue;
    const info = payload.info as Record<string, unknown> | undefined;
    const usage = info?.last_token_usage as Record<string, number> | undefined;
    if (!usage) continue;

    const totalInput = usage.input_tokens || 0;
    const cacheRead = usage.cached_input_tokens || 0;
    const inputTok = Math.max(0, totalInput - cacheRead);
    const outputTok = (usage.output_tokens || 0) + (usage.reasoning_output_tokens || 0);
    if (inputTok === 0 && outputTok === 0 && cacheRead === 0) continue;

    const tsMs = parseTimestamp(entry.timestamp);
    const date = tsMs ? toLocalDate(tsMs) : fallbackDate;
    const time = tsMs ? toLocalTime(tsMs) : '00:00';
    if (!date) continue;
    if (!dayData[date]) dayData[date] = makeDayEntry();
    addUsage(dayData[date], time, {
      input_tokens: inputTok,
      output_tokens: outputTok,
      cache_read: cacheRead,
      cache_write: 0,
      cost: 0,
    });
  }

  return { dayData, meta };
}

export function collectCodex(): Session[] {
  const sessions: Session[] = [];
  const codexDir = path.join(process.env.HOME || '', '.codex/sessions');
  if (!fs.existsSync(codexDir)) return sessions;

  for (const filePath of findJsonlFiles(codexDir)) {
    try {
      const { dayData, meta } = parseCodexFile(filePath);
      for (const [date, data] of Object.entries(dayData)) {
        const tokenCount = data.input_tokens + data.output_tokens + data.cache_read;
        if (tokenCount === 0) continue;
        sessions.push({
          date,
          time: data.times.sort()[0] || '00:00',
          source: 'Codex',
          file: path.basename(filePath),
          cost: 0,
          input_tokens: data.input_tokens,
          output_tokens: data.output_tokens,
          cache_read: data.cache_read,
          cache_write: 0,
          model: 'Codex',
          title: meta.title || undefined,
          sessionId: meta.sessionId || undefined,
          cwd: meta.cwd || undefined,
          history: meta.history && meta.history.length > 0 ? meta.history : undefined,
          hours: finalizeHours(data.hours),
        });
      }
    } catch {}
  }
  return sessions;
}
