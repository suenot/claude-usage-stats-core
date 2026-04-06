import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayEntry, Session } from '../models/session.js';
import { makeDayEntry } from '../models/session.js';
import { getPricing } from '../models/pricing.js';
import { toLocalDate, toLocalTime, parseTimestamp } from '../utils/date.js';
import { parseJsonlFileSync } from '../utils/jsonl.js';

function parseOpenClawFormat(filePath: string): Record<string, DayEntry> {
  const entries = parseJsonlFileSync(filePath) as Record<string, unknown>[];
  const dayData: Record<string, DayEntry> = {};
  let fallbackDate: string | null = null;
  try { fallbackDate = toLocalDate(fs.statSync(filePath).mtimeMs); } catch {}

  for (const entry of entries) {
    const msg = entry.message as Record<string, unknown> | undefined;
    const usage = ((msg && (msg as Record<string, unknown>).usage) || entry.usage) as Record<string, unknown> | undefined;
    if (!usage) continue;
    if (!usage.cost && !usage.input && !usage.output) continue;

    const tsMs = parseTimestamp(entry.timestamp) || parseTimestamp(msg && (msg as Record<string, unknown>).timestamp);
    const date = tsMs ? toLocalDate(tsMs) : fallbackDate;
    const time = tsMs ? toLocalTime(tsMs) : '00:00';
    if (!date) continue;

    if (!dayData[date]) dayData[date] = makeDayEntry();
    const dd = dayData[date];
    if (time) dd.times.push(time);

    const model = ((msg && (msg as Record<string, unknown>).model) || entry.model || '') as string;
    if (model && model.startsWith('claude')) dd.models.add(model);

    const cost = usage.cost as Record<string, number> | undefined;
    if (cost && cost.total) {
      dd.cost += cost.total;
    } else {
      const pricing = getPricing(model);
      const inp = (usage.input as number) || 0;
      const out = (usage.output as number) || 0;
      const cr = (usage.cacheRead as number) || 0;
      const cw = (usage.cacheWrite as number) || 0;
      dd.cost += (inp * pricing.input + out * pricing.output + cw * pricing.cacheWrite + cr * pricing.cacheRead) / 1000000;
    }
    dd.input_tokens += ((usage.input as number) || 0);
    dd.output_tokens += ((usage.output as number) || 0);
    dd.cache_read += ((usage.cacheRead as number) || 0);
    dd.cache_write += ((usage.cacheWrite as number) || 0);
  }
  return dayData;
}

export function collectOpenClaw(): Session[] {
  const sessions: Session[] = [];
  const seenFiles = new Set<string>();
  for (const dirName of ['openclaw', 'clawdbot']) {
    const sessDir = path.join(process.env.HOME || '', `.${dirName}/agents/main/sessions`);
    if (!fs.existsSync(sessDir)) continue;
    const source = dirName === 'openclaw' ? 'OpenClaw' : 'Clawdbot';
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl'));
    for (const file of files) {
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      try {
        const fullPath = path.join(sessDir, file);
        const dayData = parseOpenClawFormat(fullPath);
        for (const [date, data] of Object.entries(dayData)) {
          if (data.cost < 0.0001) continue;
          const models = [...data.models];
          const time = data.times.length > 0 ? data.times.sort()[0] : '00:00';
          sessions.push({
            date, time, source: source as Session['source'], file,
            cost: parseFloat(data.cost.toFixed(4)),
            input_tokens: data.input_tokens, output_tokens: data.output_tokens,
            cache_read: data.cache_read, cache_write: data.cache_write,
            model: models[models.length - 1] || '',
          });
        }
      } catch {}
    }
  }
  return sessions;
}
