import type { Session } from './models/session.js';

export const PRIVATE_SNAPSHOT_VERSION = 1 as const;
const MAX_SESSIONS = 100_000;

export interface PrivateAnalyticsSnapshotV1 {
  schema_version: typeof PRIVATE_SNAPSHOT_VERSION;
  generated_at: string;
  /** Session history is opt-in because it can contain prompt text. */
  history_included: boolean;
  sessions: Session[];
}

export class InvalidPrivateSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPrivateSnapshotError';
  }
}

export function buildPrivateAnalyticsSnapshot(sessions: Session[], includeHistory = false): PrivateAnalyticsSnapshotV1 {
  return {
    schema_version: PRIVATE_SNAPSHOT_VERSION,
    generated_at: new Date().toISOString(),
    history_included: includeHistory,
    sessions: sessions.map(session => {
      const { history, events: _events, file: _file, cwd, title: _title, sessionId: _sessionId, ...withoutSensitiveFields } = session;
      // Absolute source paths and per-request events are not needed to render owner analytics.
      // The project label keeps grouping useful without uploading the local directory tree.
      const project = cwd ? cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() : undefined;
      return includeHistory
        ? structuredClone({ ...withoutSensitiveFields, model: session.model || 'unknown', file: 'remote', cwd: project, history })
        : structuredClone({ ...withoutSensitiveFields, model: session.model || 'unknown', file: 'remote', cwd: project });
    }),
  };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidPrivateSnapshotError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max = 4096): void {
  if (typeof value !== 'string' || !value || value.length > max) throw new InvalidPrivateSnapshotError(`${name} is invalid`);
}

function number(value: unknown, name: string, integer = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (integer && !Number.isInteger(value))) {
    throw new InvalidPrivateSnapshotError(`${name} is invalid`);
  }
}

function usage(value: unknown, name: string, event = false): void {
  const row = object(value, name);
  const keys = event
    ? ['cost', 'input_tokens', 'output_tokens', 'cache_read', 'cache_write', 'timestamp_ms', 'model', 'cache_write_5m', 'cache_write_1h']
    : ['cost', 'input_tokens', 'output_tokens', 'cache_read', 'cache_write'];
  if (Object.keys(row).some(key => !keys.includes(key))) throw new InvalidPrivateSnapshotError(`${name} has unsupported fields`);
  for (const key of ['cost', 'input_tokens', 'output_tokens', 'cache_read', 'cache_write']) number(row[key], `${name}.${key}`);
  if (event) {
    number(row.timestamp_ms, `${name}.timestamp_ms`, true);
    string(row.model, `${name}.model`, 200);
    number(row.cache_write_5m, `${name}.cache_write_5m`);
    number(row.cache_write_1h, `${name}.cache_write_1h`);
  }
}

export function validatePrivateAnalyticsSnapshot(value: unknown): PrivateAnalyticsSnapshotV1 {
  const snapshot = object(value, 'snapshot');
  if (Object.keys(snapshot).some(key => !['schema_version', 'generated_at', 'history_included', 'sessions'].includes(key))) throw new InvalidPrivateSnapshotError('snapshot has unsupported fields');
  if (snapshot.schema_version !== PRIVATE_SNAPSHOT_VERSION) throw new InvalidPrivateSnapshotError('unsupported snapshot version');
  string(snapshot.generated_at, 'generated_at', 40);
  if (!Number.isFinite(Date.parse(snapshot.generated_at as string)) || Date.parse(snapshot.generated_at as string) > Date.now() + 5 * 60_000) throw new InvalidPrivateSnapshotError('generated_at is invalid');
  if (typeof snapshot.history_included !== 'boolean' || !Array.isArray(snapshot.sessions) || snapshot.sessions.length > MAX_SESSIONS) throw new InvalidPrivateSnapshotError('sessions are invalid');
  for (const [index, value] of snapshot.sessions.entries()) {
    const session = object(value, `sessions.${index}`);
    const allowed = ['date', 'time', 'source', 'file', 'cost', 'input_tokens', 'output_tokens', 'cache_read', 'cache_write', 'model', 'title', 'sessionId', 'cwd', 'history', 'hours'];
    if (Object.keys(session).some(key => !allowed.includes(key))) throw new InvalidPrivateSnapshotError(`sessions.${index} has unsupported fields`);
    for (const key of ['date', 'time', 'source', 'file', 'model']) string(session[key], `sessions.${index}.${key}`);
    for (const key of ['cost', 'input_tokens', 'output_tokens', 'cache_read', 'cache_write']) number(session[key], `sessions.${index}.${key}`);
    for (const key of ['title', 'sessionId', 'cwd']) if (session[key] !== undefined) string(session[key], `sessions.${index}.${key}`);
    if (!snapshot.history_included && session.history !== undefined) throw new InvalidPrivateSnapshotError('history was not enabled');
    if (session.history !== undefined) {
      if (!Array.isArray(session.history) || session.history.length > 10_000) throw new InvalidPrivateSnapshotError(`sessions.${index}.history is invalid`);
      for (const turn of session.history) { const row = object(turn, 'history item'); if (!['user', 'ai'].includes(String(row.role))) throw new InvalidPrivateSnapshotError('history role is invalid'); string(row.text, 'history text', 200_000); }
    }
    if (session.hours !== undefined) for (const [hour, bucket] of Object.entries(object(session.hours, 'hours'))) { if (!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(hour)) throw new InvalidPrivateSnapshotError('hour is invalid'); usage(bucket, 'hour'); }
  }
  return structuredClone(value) as PrivateAnalyticsSnapshotV1;
}
