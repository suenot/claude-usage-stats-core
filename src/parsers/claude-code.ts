import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayEntry, Session, ConversationTurn } from '../models/session.js';
import { addUsage, finalizeHours, makeDayEntry } from '../models/session.js';
import { getPricing } from '../models/pricing.js';
import { toLocalDate, toLocalTime, parseTimestamp } from '../utils/date.js';
import { findJsonlFiles, parseJsonlFileSync } from '../utils/jsonl.js';
import { cleanMessageText, extractText } from '../utils/text.js';

interface SessionMeta {
  title: string;
  sessionId: string;
  cwd: string;
  history: ConversationTurn[];
}

function extractSessionMeta(filePath: string): SessionMeta {
  const meta: SessionMeta = { title: '', sessionId: '', cwd: '', history: [] };
  try {
    const entries = parseJsonlFileSync(filePath) as Record<string, unknown>[];
    let foundTitle = false;

    for (const entry of entries) {
      if (!meta.sessionId && entry.sessionId) meta.sessionId = entry.sessionId as string;
      if (!meta.cwd && entry.cwd) meta.cwd = entry.cwd as string;

      const msg = entry.message as Record<string, unknown> | undefined;
      if (!msg || typeof msg !== 'object') continue;
      const role = msg.role as string;
      if (role !== 'user' && role !== 'assistant') continue;

      const rawText = extractText(msg);
      if (!rawText) continue;
      const text = cleanMessageText(rawText);
      if (!text) continue;

      if (!foundTitle && role === 'user') {
        meta.title = text.length > 80 ? text.substring(0, 77) + '...' : text;
        foundTitle = true;
      }

      if (meta.history.length < 15) {
        meta.history.push({
          role: role === 'user' ? 'user' : 'ai',
          text: text.length > 120 ? text.substring(0, 117) + '...' : text,
        });
      }
    }
  } catch {}

  if (!meta.sessionId) {
    const base = path.basename(filePath, '.jsonl');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(base)) {
      meta.sessionId = base;
    }
  }
  return meta;
}

function parseClaudeCodeFormat(filePath: string): Record<string, DayEntry> {
  const entries = parseJsonlFileSync(filePath) as Record<string, unknown>[];
  const dayData: Record<string, DayEntry> = {};
  let fallbackDate: string | null = null;
  try { fallbackDate = toLocalDate(fs.statSync(filePath).mtimeMs); } catch {}

  for (const entry of entries) {
    const msg = entry.message as Record<string, unknown> | undefined;
    const usage = ((msg && (msg as Record<string, unknown>).usage) || entry.usage) as Record<string, number> | undefined;
    if (!usage) continue;

    const inputTok = usage.input_tokens || 0;
    const outputTok = usage.output_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    if (inputTok === 0 && outputTok === 0 && cacheRead === 0 && cacheWrite === 0) continue;

    const tsMs = parseTimestamp(entry.timestamp) || parseTimestamp(msg && (msg as Record<string, unknown>).timestamp);
    const date = tsMs ? toLocalDate(tsMs) : fallbackDate;
    const time = tsMs ? toLocalTime(tsMs) : '00:00';
    if (!date) continue;

    if (!dayData[date]) dayData[date] = makeDayEntry();
    const dd = dayData[date];

    const model = ((msg && (msg as Record<string, unknown>).model) || entry.model || '') as string;
    if (model && model.startsWith('claude')) dd.models.add(model);

    const pricing = getPricing(model);
    addUsage(dd, time, {
      input_tokens: inputTok,
      output_tokens: outputTok,
      cache_read: cacheRead,
      cache_write: cacheWrite,
      cost: (inputTok * pricing.input + outputTok * pricing.output + cacheWrite * pricing.cacheWrite + cacheRead * pricing.cacheRead) / 1000000,
    });
  }
  return dayData;
}

function pushSessions(
  sessions: Session[],
  dayData: Record<string, DayEntry>,
  source: Session['source'],
  fileName: string,
  meta: SessionMeta,
): void {
  for (const [date, data] of Object.entries(dayData)) {
    if (data.cost < 0.0001) continue;
    const models = [...data.models];
    const time = data.times.length > 0 ? data.times.sort()[0] : '00:00';
    const entry: Session = {
      date,
      time,
      source,
      file: fileName,
      cost: parseFloat(data.cost.toFixed(4)),
      input_tokens: data.input_tokens,
      output_tokens: data.output_tokens,
      cache_read: data.cache_read,
      cache_write: data.cache_write,
      model: models[models.length - 1] || '',
      hours: finalizeHours(data.hours),
    };
    if (meta.title) entry.title = meta.title;
    if (meta.sessionId) entry.sessionId = meta.sessionId;
    if (meta.cwd) entry.cwd = meta.cwd;
    if (meta.history && meta.history.length > 0) entry.history = meta.history;
    sessions.push(entry);
  }
}

export function collectClaudeCode(): Session[] {
  const sessions: Session[] = [];
  const claudeDir = path.join(process.env.HOME || '', '.claude/projects');
  if (!fs.existsSync(claudeDir)) return sessions;
  const files = findJsonlFiles(claudeDir);
  for (const filePath of files) {
    try {
      const dayData = parseClaudeCodeFormat(filePath);
      const meta = extractSessionMeta(filePath);
      pushSessions(sessions, dayData, 'Claude Code', path.basename(filePath), meta);
    } catch {}
  }
  return sessions;
}

export function collectClaudeDesktop(): Session[] {
  const sessions: Session[] = [];
  const baseDir = path.join(process.env.HOME || '', 'Library/Application Support/Claude/local-agent-mode-sessions');
  if (!fs.existsSync(baseDir)) return sessions;
  const files = findJsonlFiles(baseDir);
  for (const filePath of files) {
    try {
      const dayData = parseClaudeCodeFormat(filePath);
      const meta = extractSessionMeta(filePath);
      pushSessions(sessions, dayData, 'Claude Desktop', path.basename(filePath), meta);
    } catch {}
  }
  return sessions;
}

export function collectCursor(): Session[] {
  const sessions: Session[] = [];
  const searchDirs = [
    path.join(process.env.HOME || '', '.cursor/projects'),
    path.join(process.env.HOME || '', 'Library/Application Support/Cursor/User/workspaceStorage'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      try {
        const dayData = parseClaudeCodeFormat(filePath);
        const meta = extractSessionMeta(filePath);
        pushSessions(sessions, dayData, 'Cursor', path.basename(filePath), meta);
      } catch {}
    }
  }
  return sessions;
}

export function collectWindsurf(): Session[] {
  const sessions: Session[] = [];
  const searchDirs = [
    path.join(process.env.HOME || '', '.windsurf/projects'),
    path.join(process.env.HOME || '', '.windsurf'),
    path.join(process.env.HOME || '', 'Library/Application Support/Windsurf/User/workspaceStorage'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      try {
        const dayData = parseClaudeCodeFormat(filePath);
        const meta = extractSessionMeta(filePath);
        pushSessions(sessions, dayData, 'Windsurf', path.basename(filePath), meta);
      } catch {}
    }
  }
  return sessions;
}

export function collectCline(): Session[] {
  const sessions: Session[] = [];
  const searchDirs = [
    path.join(process.env.HOME || '', '.cline'),
    path.join(process.env.HOME || '', 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev'),
    path.join(process.env.HOME || '', 'Library/Application Support/Code/User/globalStorage/cline.cline'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      try {
        const dayData = parseClaudeCodeFormat(filePath);
        const meta = extractSessionMeta(filePath);
        pushSessions(sessions, dayData, 'Cline', path.basename(filePath), meta);
      } catch {}
    }
  }
  return sessions;
}

export function collectRooCode(): Session[] {
  const sessions: Session[] = [];
  const searchDirs = [
    path.join(process.env.HOME || '', '.roo-code'),
    path.join(process.env.HOME || '', 'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = findJsonlFiles(dir);
    for (const filePath of files) {
      try {
        const dayData = parseClaudeCodeFormat(filePath);
        const meta = extractSessionMeta(filePath);
        pushSessions(sessions, dayData, 'Roo Code', path.basename(filePath), meta);
      } catch {}
    }
  }
  return sessions;
}
