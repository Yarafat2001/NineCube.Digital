export function productSpecs(json?: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(json ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 40).map(([k, v]) => [k, String(v)]));
  } catch { return {}; }
}
