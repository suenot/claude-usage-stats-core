export interface ModelPricing {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// GLM 5.2 (Zhipu, via proxy). Claude Code transcripts routed through the GLM
// backend do not record a model field, so those sessions arrive as empty/
// "unknown". In this setup every unlabeled session IS a GLM 5.2 call, so the
// empty/unknown/fallback case prices as GLM. Input/output per the user's plan;
// cache_read = official Z.ai cached-input rate, cache_write = 0 (free storage).
const GLM_PRICING: ModelPricing = { input: 0.76, output: 2.42, cacheWrite: 0, cacheRead: 0.11 };

export function getPricing(model: string | undefined): ModelPricing {
  // No model recorded → GLM 5.2 proxy session (see above).
  if (!model) return GLM_PRICING;
  const m = model.toLowerCase();
  if (m === 'unknown' || m.includes('glm')) return GLM_PRICING;

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

  if (m.includes('gpt-5.6-luna'))
    return { input: 0.50, output: 3, cacheWrite: 0, cacheRead: 0.05 };
  if (m.includes('gpt-5.6-terra'))
    return { input: 2.50, output: 15, cacheWrite: 0, cacheRead: 0.25 };
  if (m.includes('gpt-5.6-sol'))
    return { input: 5, output: 30, cacheWrite: 0, cacheRead: 0.50 };

  // Unmatched non-empty model → also GLM (proxy sessions occasionally leak a
  // non-Claude id). Keeps the "unknown = GLM" invariant from the user's setup.
  return GLM_PRICING;
}

export function getModelFamily(model: string): string {
  const m = (model || '').toLowerCase();
  if (!m || m === 'unknown' || m.includes('glm')) return 'GLM 5.2';
  if (m.includes('opus')) return 'Opus';
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  if (m.includes('fable')) return 'Fable';
  return 'GLM 5.2';
}
