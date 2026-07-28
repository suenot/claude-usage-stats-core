import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Session } from './models/session.js';

const DEFAULT_CACHE_DIR = path.join(process.env.HOME || '', '.claude-stats');
const CACHE_FILENAME = 'sessions-cache.json';

// Bump whenever Session gains a field the parsers must re-derive from the raw
// transcripts. A cached session is not repairable in place — the per-message
// timestamps it was built from live only in the source files — so a mismatch
// discards the cache and forces a full recollect.
// 2: per-hour usage buckets (Session.hours).
const CACHE_VERSION = 2;

interface CacheFile {
  version: number;
  sessions: Session[];
}

function getCachePath(cacheDir?: string): string {
  const dir = cacheDir || DEFAULT_CACHE_DIR;
  return path.join(dir, CACHE_FILENAME);
}

export function loadCache(cacheDir?: string): Session[] {
  const cachePath = getCachePath(cacheDir);
  try {
    if (!fs.existsSync(cachePath)) return [];
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    // Pre-versioning caches were a bare array; those predate Session.hours.
    if (Array.isArray(data)) return [];
    const file = data as Partial<CacheFile>;
    if (file.version !== CACHE_VERSION || !Array.isArray(file.sessions)) return [];
    return file.sessions.filter(
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
    const payload: CacheFile = { version: CACHE_VERSION, sessions };
    fs.writeFileSync(tmpFile, JSON.stringify(payload));
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
