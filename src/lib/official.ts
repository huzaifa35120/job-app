// Optional: Anthropic's own cost numbers via the Admin API cost report.
// Only works for organization accounts with an Admin API key (sk-ant-admin...). Data lags ~5 minutes.

let cache: { at: number; value: OfficialCost } | null = null;

export interface OfficialCost {
  available: boolean;
  todayUsd?: number;
  monthUsd?: number;
  fetchedAt?: string;
  error?: string;
}

/** Amounts are decimal strings in cents. */
function sumUsd(buckets: any[]): number {
  let cents = 0;
  for (const bucket of buckets) for (const r of bucket.results ?? []) cents += Number(r.amount ?? 0);
  return cents / 100;
}

export async function officialCost(): Promise<OfficialCost> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { available: false };
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const all: any[] = [];
    let page: string | null = null;
    for (let i = 0; i < 5; i++) {
      const params = new URLSearchParams({
        starting_at: monthStart.toISOString().replace(/\.\d+Z$/, "Z"),
        ending_at: new Date(dayStart.getTime() + 86_400_000).toISOString().replace(/\.\d+Z$/, "Z"),
        bucket_width: "1d",
        limit: "31",
      });
      if (page) params.set("page", page);
      const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params}`, {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "AutoJobApply/1.0" },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Cost API returned HTTP ${res.status}`);
      const json = await res.json();
      all.push(...(json.data ?? []));
      if (!json.has_more) break;
      page = json.next_page;
    }
    const value: OfficialCost = {
      available: true,
      monthUsd: sumUsd(all),
      todayUsd: sumUsd(all.filter((b) => String(b.starting_at ?? "").startsWith(dayStart.toISOString().slice(0, 10)))),
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    return { available: true, error: err instanceof Error ? err.message : String(err) };
  }
}
