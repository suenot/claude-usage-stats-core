export function cleanMessageText(text: string): string {
  text = text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim();
  text = text.replace(/<[^>]+>/g, '').trim();
  text = text.replace(/^\[SUGGESTION MODE:[^\]]*\]\s*/i, '').trim();
  const cronMatch = text.match(/^\[cron:[a-f0-9-]+\s+([^\]]*)\]\s*(.*)/i);
  if (cronMatch) {
    text = cronMatch[1].trim() + (cronMatch[2] ? ' — ' + cronMatch[2].trim() : '');
  }
  return text;
}

export function extractText(msg: Record<string, unknown>): string {
  if (!msg || typeof msg !== 'object') return '';
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    if (content.some((b: Record<string, unknown>) => b.type === 'tool_result')) return '';
    const textBlock = content.find(
      (c: Record<string, unknown>) => c.type === 'text' && c.text && (c.text as string).trim()
    );
    return textBlock ? (textBlock as Record<string, unknown>).text as string : '';
  }
  return '';
}
