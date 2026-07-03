import type { Session, Summary } from './models/session.js';
import { toLocalDate, getWeekCost } from './utils/date.js';
import { loadCache, saveCache, mergeSessions } from './cache.js';
import {
  collectClaudeCode, collectClaudeDesktop, collectCursor,
  collectWindsurf, collectCline, collectRooCode,
} from './parsers/claude-code.js';
import { collectOpenClaw } from './parsers/openclaw.js';
import { collectAider } from './parsers/aider.js';
import { collectContinue } from './parsers/continue.js';

export interface CollectorResult {
  sessions: Session[];
  summary: Summary;
  sourceResults: Record<string, number>;
}

const ALL_COLLECTORS = [
  { name: 'OpenClaw / Clawdbot', fn: collectOpenClaw },
  { name: 'Claude Code CLI', fn: collectClaudeCode },
  { name: 'Claude Desktop', fn: collectClaudeDesktop },
  { name: 'Cursor', fn: collectCursor },
  { name: 'Windsurf', fn: collectWindsurf },
  { name: 'Cline', fn: collectCline },
  { name: 'Roo Code', fn: collectRooCode },
  { name: 'Aider', fn: collectAider },
  { name: 'Continue.dev', fn: collectContinue },
];

export function collect(options?: { cacheDir?: string; verbose?: boolean }): CollectorResult {
  const verbose = options?.verbose ?? false;
  let allSessions: Session[] = [];
  const sourceResults: Record<string, number> = {};

  for (const { name, fn } of ALL_COLLECTORS) {
    if (verbose) process.stdout.write(`Scanning ${name}... `);
    const sessions = fn();
    if (sessions.length > 0) {
      if (verbose) console.log(`${sessions.length} session-day entries`);
      sourceResults[name] = sessions.length;
    } else if (verbose) {
      console.log('not found or empty');
    }
    allSessions.push(...sessions);
  }

  const cachedSessions = loadCache(options?.cacheDir);
  allSessions = mergeSessions(allSessions, cachedSessions);
  saveCache(allSessions, options?.cacheDir);

  const summary = buildSummary(allSessions);

  return { sessions: allSessions, summary, sourceResults };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildSummary(sessions: Session[]): Summary {
  const today = toLocalDate(Date.now()) || new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  const sourceTotals: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  for (const s of sessions) {
    sourceTotals[s.source] = (sourceTotals[s.source] || 0) + s.cost;
    sourceCounts[s.source] = (sourceCounts[s.source] || 0) + 1;
  }
  for (const key of Object.keys(sourceTotals)) {
    sourceTotals[key] = parseFloat(sourceTotals[key].toFixed(2));
  }

  const grandTotal = sessions.reduce((s, x) => s + x.cost, 0);
  const todayCost = sessions.filter(s => s.date === today).reduce((s, x) => s + x.cost, 0);
  const monthCost = sessions.filter(s => s.date.startsWith(currentMonth)).reduce((s, x) => s + x.cost, 0);
  const weekCost = getWeekCost(sessions);

  // Stats count only ACTIVE periods — days/months with actual spend, not calendar span.
  const dayTotals: Record<string, number> = {};
  const monthTotals: Record<string, number> = {};
  for (const s of sessions) {
    if (s.cost <= 0) continue;
    dayTotals[s.date] = (dayTotals[s.date] || 0) + s.cost;
    const m = s.date.substring(0, 7);
    monthTotals[m] = (monthTotals[m] || 0) + s.cost;
  }
  const dayValues = Object.values(dayTotals);
  const monthValues = Object.values(monthTotals);
  const activeDays = dayValues.length;
  const activeMonths = monthValues.length;
  const avgPerActiveDay = activeDays ? grandTotal / activeDays : 0;
  const avgPerActiveMonth = activeMonths ? grandTotal / activeMonths : 0;

  return {
    generated_at: new Date().toISOString(),
    today,
    current_month: currentMonth,
    totals: { ...sourceTotals, grand_total: parseFloat(grandTotal.toFixed(2)) },
    today_cost: parseFloat(todayCost.toFixed(2)),
    week_cost: parseFloat(weekCost.toFixed(2)),
    month_cost: parseFloat(monthCost.toFixed(2)),
    active_days: activeDays,
    active_months: activeMonths,
    avg_per_active_day: parseFloat(avgPerActiveDay.toFixed(2)),
    avg_per_active_month: parseFloat(avgPerActiveMonth.toFixed(2)),
    median_per_active_day: parseFloat(median(dayValues).toFixed(2)),
    median_per_active_month: parseFloat(median(monthValues).toFixed(2)),
    session_counts: { ...sourceCounts, total: sessions.length },
  };
}
