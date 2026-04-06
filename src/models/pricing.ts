export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export function getPricing(model: string | undefined): ModelPricing {
  if (!model) return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };
  const m = model.toLowerCase();

  if (m.includes('opus-4-6') || m.includes('opus-4.6') || m.includes('opus-4-5') || m.includes('opus-4.5'))
    return { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.50 };
  if (m.includes('opus-4-1') || m.includes('opus-4.1'))
    return { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 };
  if (m.includes('opus'))
    return { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 };
  if (m.includes('sonnet'))
    return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };
  if (m.includes('haiku-4-5') || m.includes('haiku-4.5'))
    return { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.10 };
  if (m.includes('haiku'))
    return { input: 0.25, output: 1.25, cacheWrite: 0.30, cacheRead: 0.03 };

  return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };
}

export function getModelFamily(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  return 'Unknown';
}
