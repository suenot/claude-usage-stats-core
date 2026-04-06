import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

export function findJsonlFiles(dir: string, maxDepth = 10): string[] {
  const results: string[] = [];
  if (maxDepth <= 0) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.git')) {
        results.push(...findJsonlFiles(fullPath, maxDepth - 1));
      } else if (entry.name.endsWith('.jsonl') && !entry.name.includes('audit')) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

export async function parseJsonlFile<T>(filePath: string): Promise<T[]> {
  const results: T[] = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      results.push(JSON.parse(line));
    } catch {}
  }
  return results;
}

export function getDirectoryFingerprint(dir: string): string {
  // Fast fingerprint: check top-level directory mtime + count of subdirectories
  // Directories get new mtime when files are added/removed
  try {
    if (!fs.existsSync(dir)) return '';
    const stat = fs.statSync(dir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirCount = entries.filter(e => e.isDirectory()).length;
    // Also check the most recently modified subdirectory
    let latestMtime = stat.mtimeMs;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const subStat = fs.statSync(path.join(dir, entry.name));
        if (subStat.mtimeMs > latestMtime) latestMtime = subStat.mtimeMs;
      } catch {}
    }
    return `${dir}:${dirCount}:${latestMtime}`;
  } catch {
    return '';
  }
}

export function parseJsonlFileSync(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results: unknown[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      results.push(JSON.parse(line));
    } catch {}
  }
  return results;
}
