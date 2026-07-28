import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayEntry, Session } from '../models/session.js';
import { addUsage, finalizeHours, makeDayEntry } from '../models/session.js';
import { getPricing } from '../models/pricing.js';
import { toLocalDate, toLocalTime, parseTimestamp } from '../utils/date.js';
import { parseJsonlFileSync } from '../utils/jsonl.js';

function parseAiderFormat(filePath: string): Record<string, DayEntry> {
  const entries = parseJsonlFileSync(filePath) as Record<string, unknown>[];
  const dayData: Record<string, DayEntry> = {};
  let fallbackDate: string | null = null;
  try { fallbackDate = toLocalDate(fs.statSync(filePath).mtimeMs); } catch {}

  for (const entry of entries) {
    const usage = (entry.usage || (entry.response as Record<string, unknown>)?.usage) as Record<string, number> | undefined;
    if (!usage) continue;

    const inputTok = usage.prompt_tokens || usage.input_tokens || 0;
    const outputTok = usage.completion_tokens || usage.output_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheWrite = usage.cache_creation_input_tokens || 0;
    if (inputTok === 0 && outputTok === 0) continue;

    let tsMs = parseTimestamp(entry.timestamp) || parseTimestamp(entry.created);
    if (entry.created && typeof entry.created === 'number' && (entry.created as number) < 2000000000) {
      tsMs = (entry.created as number) * 1000;
    }
    const date = tsMs ? toLocalDate(tsMs) : fallbackDate;
    const time = tsMs ? toLocalTime(tsMs) : '00:00';
    if (!date) continue;

    if (!dayData[date]) dayData[date] = makeDayEntry();
    const dd = dayData[date];

    const model = (entry.model || '') as string;
    if (model && model.includes('claude')) dd.models.add(model);

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

export function collectAider(): Session[] {
  const sessions: Session[] = [];
  const searchDirs = [
    path.join(process.env.HOME || '', '.aider'),
    path.join(process.env.HOME || '', '.aider/logs'),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.jsonl') && !f.endsWith('.json')) continue;
        const filePath = path.join(dir, f);
        const dayData = parseAiderFormat(filePath);
        for (const [date, data] of Object.entries(dayData)) {
          if (data.cost < 0.0001) continue;
          const models = [...data.models];
          const time = data.times.length > 0 ? data.times.sort()[0] : '00:00';
          sessions.push({
            date, time, source: 'Aider', file: f,
            cost: parseFloat(data.cost.toFixed(4)),
            input_tokens: data.input_tokens, output_tokens: data.output_tokens,
            cache_read: data.cache_read, cache_write: data.cache_write,
            model: models[models.length - 1] || '',
            hours: finalizeHours(data.hours),
          });
        }
      }
    } catch {}
  }
  return sessions;
}
