import type { Source } from './source.js';

export interface ConversationTurn {
  role: 'user' | 'ai';
  text: string;
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
}

export function makeDayEntry(): DayEntry {
  return { cost: 0, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, models: new Set(), times: [] };
}
