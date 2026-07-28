import type { Source } from './source.js';

export interface ConversationTurn {
  role: 'user' | 'ai';
  text: string;
}

export interface HourBucket {
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
}

export interface Session {
  date: string;
  time: string;
  source: Source;
  file: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  model: string;
  title?: string;
  sessionId?: string;
  cwd?: string;
  history?: ConversationTurn[];
  // Usage split by hour of day (0-23), local time. `time` is only the session's
  // FIRST event, so it cannot answer "when during the day were tokens spent" —
  // a day-long session would land entirely in its opening hour. This carries
  // the real distribution, folded in at parse time.
  hours?: Record<number, HourBucket>;
}

export interface Summary {
  generated_at: string;
  today: string;
  current_month: string;
  totals: Record<string, number>;
  today_cost: number;
  week_cost: number;
  month_cost: number;
  // Averages over ACTIVE periods only — days/months where tokens were actually spent.
  active_days: number;
  active_months: number;
  avg_per_active_day: number;
  avg_per_active_month: number;
  median_per_active_day: number;
  median_per_active_month: number;
  session_counts: Record<string, number>;
}

export interface DayEntry {
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  models: Set<string>;
  times: string[];
  hours: Record<number, HourBucket>;
}

export function makeHourBucket(): HourBucket {
  return { cost: 0, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0 };
}

export function makeDayEntry(): DayEntry {
  return { cost: 0, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, models: new Set(), times: [], hours: {} };
}

// Folds one usage record into its day totals AND its hour-of-day bucket.
// Every parser goes through here: parse time is the only point where the
// per-message timestamp still exists, so this is the single place hour-level
// attribution can be captured at all.
export function addUsage(day: DayEntry, time: string | null, usage: HourBucket): void {
  day.cost += usage.cost;
  day.input_tokens += usage.input_tokens;
  day.output_tokens += usage.output_tokens;
  day.cache_read += usage.cache_read;
  day.cache_write += usage.cache_write;
  if (!time) return;
  day.times.push(time);

  const hour = parseInt(time.slice(0, 2), 10);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return;
  const bucket = (day.hours[hour] ||= makeHourBucket());
  bucket.cost += usage.cost;
  bucket.input_tokens += usage.input_tokens;
  bucket.output_tokens += usage.output_tokens;
  bucket.cache_read += usage.cache_read;
  bucket.cache_write += usage.cache_write;
}

// Rounds the per-hour costs before they reach the cache, matching how session
// totals are stored.
export function finalizeHours(hours: Record<number, HourBucket>): Record<number, HourBucket> {
  const out: Record<number, HourBucket> = {};
  for (const [hour, b] of Object.entries(hours)) {
    out[Number(hour)] = { ...b, cost: parseFloat(b.cost.toFixed(4)) };
  }
  return out;
}
