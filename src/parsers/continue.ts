import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DayEntry, Session } from '../models/session.js';
import { addUsage, finalizeHours, makeDayEntry } from '../models/session.js';
import { getPricing } from '../models/pricing.js';
import { toLocalDate, toLocalTime, parseTimestamp } from '../utils/date.js';

function parseContinueFormat(filePath: string): Record<string, DayEntry> {
  const dayData: Record<string, DayEntry> = {};
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const steps = data.steps || data.history || [];
    for (const step of steps) {
      const inputTok = step.promptTokens || step.usage?.input_tokens || 0;
      const outputTok = step.completionTokens || step.usage?.output_tokens || 0;
      if (inputTok === 0 && outputTok === 0) continue;

      const tsMs = parseTimestamp(step.timestamp) || parseTimestamp(data.dateCreated);
      let date = tsMs ? toLocalDate(tsMs) : null;
      const time = tsMs ? toLocalTime(tsMs) : '00:00';
      if (!date) {
        try { date = toLocalDate(fs.statSync(filePath).mtimeMs); } catch { continue; }
      }
      if (!date) continue;

      if (!dayData[date]) dayData[date] = makeDayEntry();
      const dd = dayData[date];

      const model = step.model || data.model || '';
      if (model && model.includes('claude')) dd.models.add(model);

      const pricing = getPricing(model);
      addUsage(dd, time, {
        input_tokens: inputTok,
        output_tokens: outputTok,
        cache_read: 0,
        cache_write: 0,
        cost: (inputTok * pricing.input + outputTok * pricing.output) / 1000000,
      });
    }
  } catch {}
  return dayData;
}

export function collectContinue(): Session[] {
  const sessions: Session[] = [];
  const sessDir = path.join(process.env.HOME || '', '.continue/sessions');
  if (!fs.existsSync(sessDir)) return sessions;
  try {
    for (const f of fs.readdirSync(sessDir)) {
      if (!f.endsWith('.json')) continue;
      const dayData = parseContinueFormat(path.join(sessDir, f));
      for (const [date, data] of Object.entries(dayData)) {
        if (data.cost < 0.0001) continue;
        const models = [...data.models];
        const time = data.times.length > 0 ? data.times.sort()[0] : '00:00';
        sessions.push({
          date, time, source: 'Continue', file: f,
          cost: parseFloat(data.cost.toFixed(4)),
          input_tokens: data.input_tokens, output_tokens: data.output_tokens,
          cache_read: data.cache_read, cache_write: data.cache_write,
          model: models[models.length - 1] || '',
          hours: finalizeHours(data.hours),
        });
      }
    }
  } catch {}
  return sessions;
}
