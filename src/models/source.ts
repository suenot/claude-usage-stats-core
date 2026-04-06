export type Source =
  | 'OpenClaw'
  | 'Clawdbot'
  | 'Claude Code'
  | 'Claude Desktop'
  | 'Cursor'
  | 'Windsurf'
  | 'Cline'
  | 'Roo Code'
  | 'Aider'
  | 'Continue';

export const SOURCE_COLORS: Record<Source, string> = {
  'OpenClaw': '#22d3ee',
  'Clawdbot': '#22d3ee',
  'Claude Code': '#60a5fa',
  'Claude Desktop': '#a78bfa',
  'Cursor': '#34d399',
  'Windsurf': '#fbbf24',
  'Cline': '#f87171',
  'Roo Code': '#fb923c',
  'Aider': '#e879f9',
  'Continue': '#94a3b8',
};
