import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Session } from './models/session.js';

const DEFAULT_CACHE_DIR = path.join(process.env.HOME || '', '.claude-stats');
const CACHE_FILENAME = 'sessions-cache.json';

function getCachePath(cacheDir?: string): string {
  const dir = cacheDir || DEFAULT_CACHE_DIR;
  return path.join(dir, CACHE_FILENAME);
}

export function loadCache(cacheDir?: string): Session[] {
  const cachePath = getCachePath(cacheDir);
  try {
    if (!fs.existsSync(cachePath)) return [];
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (s: Partial<Session>) =>
        s && typeof s.source === 'string' && typeof s.file === 'string' &&
        typeof s.date === 'string' && typeof s.cost === 'number'
    );
  } catch {
    return [];
  }
}

export function saveCache(sessions: Session[], cacheDir?: string): void {
  const dir = cacheDir || DEFAULT_CACHE_DIR;
  const cachePath = getCachePath(dir);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = cachePath + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(sessions));
    fs.renameSync(tmpFile, cachePath);
  } catch {}
}

export function mergeSessions(freshSessions: Session[], cachedSessions: Session[]): Session[] {
  const freshKeys = new Set<string>();
  for (const s of freshSessions) {
    freshKeys.add(`${s.source}|${s.file}|${s.date}`);
  }
  const merged = [...freshSessions];
  for (const s of cachedSessions) {
    const key = `${s.source}|${s.file}|${s.date}`;
    if (!freshKeys.has(key)) {
      merged.push(s);
    }
  }
  return merged;
}
