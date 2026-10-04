// List prices in USD per million tokens (Anthropic first-party API).
// Keep in sync with https://platform.claude.com/docs/en/about-claude/pricing

export interface ModelPrice {
  label: string;
  input: number;
  output: number;
  /** Shown in the model pickers in Settings. */
  selectable: boolean;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { label: "Claude Opus 5 (best writing)", input: 5, output: 25, selectable: true },
  "claude-sonnet-5": { label: "Claude Sonnet 5 (balanced)", input: 2, output: 10, selectable: true },
  "claude-haiku-4-5": { label: "Claude Haiku 4.5 (cheapest)", input: 1, output: 5, selectable: true },
  "claude-fable-5-1": { label: "Claude Fable 5.1 (most capable, expensive)", input: 10, output: 50, selectable: true },
  "claude-opus-5-5": { label: "Claude Opus 5.5", input: 4, output: 20, selectable: false },
  "claude-opus-4-8": { label: "Claude Opus 4.8", input: 5, output: 25, selectable: false },
  "claude-opus-4-7": { label: "Claude Opus 4.7", input: 5, output: 25, selectable: false },
  "claude-opus-4-6": { label: "Claude Opus 4.6", input: 5, output: 25, selectable: false },
  "claude-sonnet-4-6": { label: "Claude Sonnet 4.6", input: 3, output: 15, selectable: false },
  "claude-fable-5": { label: "Claude Fable 5", input: 10, output: 50, selectable: false },
};

export const CACHE_WRITE_MULTIPLIER = 1.25; // 5-minute TTL
export const CACHE_READ_MULTIPLIER = 0.1;
export const WEB_SEARCH_PRICE = 10 / 1000; // $10 per 1,000 searches

export function priceFor(model: string): ModelPrice {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  // Longest matching prefix wins (handles any suffixed ids); unknown models are
  // priced at the Opus rate so limits err on the safe side.
  const key = Object.keys(MODEL_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return key ? MODEL_PRICES[key] : { label: model, input: 5, output: 25, selectable: false };
}

export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  webSearches: number;
}

export function costFor(model: string, t: TokenCounts): number {
  const p = priceFor(model);
  return (
    (t.input * p.input +
      t.cacheWrite * p.input * CACHE_WRITE_MULTIPLIER +
      t.cacheRead * p.input * CACHE_READ_MULTIPLIER +
      t.output * p.output) /
      1_000_000 +
    t.webSearches * WEB_SEARCH_PRICE
  );
}
