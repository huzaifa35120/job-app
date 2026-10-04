import { query, queryOne } from "./db";
import { CATEGORIES, type Category, getSettings } from "./settings";
import type { TokenCounts } from "./pricing";

export class LimitReachedError extends Error {
  constructor(
    public category: Category,
    public spent: number,
    public limit: number,
    public estimate: number,
  ) {
    super(
      `Daily limit reached for "${category}": spent $${spent.toFixed(3)} of $${limit.toFixed(limit < 0.1 ? 3 : 2)} ` +
        `(next call needs about $${estimate.toFixed(3)}). Raise the limit in Settings or wait until tomorrow.`,
    );
    this.name = "LimitReachedError";
  }
}

/** SQL expression for local midnight today in the given timezone ($1). */
const TODAY_START = `(date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)`;
const MONTH_START = `(date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1)`;

export async function spentToday(category?: Category): Promise<number> {
  const { timezone } = await getSettings();
  const row = await queryOne<{ total: number | null }>(
    `SELECT SUM(cost_usd) AS total FROM usage_log
     WHERE created_at >= ${TODAY_START} ${category ? "AND category = $2" : ""}`,
    category ? [timezone, category] : [timezone],
  );
  return Number(row?.total ?? 0);
}

export async function checkLimit(category: Category, estimate: number): Promise<void> {
  const settings = await getSettings();
  const limit = settings.limits[category] ?? 0;
  const spent = await spentToday(category);
  if (spent + estimate > limit) throw new LimitReachedError(category, spent, limit, estimate);
}

export async function remainingToday(category: Category): Promise<number> {
  const settings = await getSettings();
  return Math.max(0, (settings.limits[category] ?? 0) - (await spentToday(category)));
}

export async function startUsage(entry: {
  category: Category;
  operation: string;
  model: string;
  jobId?: number | null;
  detail?: string;
}): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO usage_log (category, operation, model, job_id, detail, status)
     VALUES ($1, $2, $3, $4, $5, 'running') RETURNING id`,
    [entry.category, entry.operation, entry.model, entry.jobId ?? null, entry.detail ?? ""],
  );
  return row!.id;
}

export async function finishUsage(
  id: number,
  result: { model: string; tokens: TokenCounts; cost: number; durationMs: number; status: "ok" | "error"; detail?: string },
): Promise<void> {
  await query(
    `UPDATE usage_log SET model = $2, input_tokens = $3, output_tokens = $4, cache_read_tokens = $5,
       cache_write_tokens = $6, web_searches = $7, cost_usd = $8, duration_ms = $9, status = $10,
       detail = CASE WHEN $11 = '' THEN detail ELSE $11 END
     WHERE id = $1`,
    [
      id,
      result.model,
      result.tokens.input,
      result.tokens.output,
      result.tokens.cacheRead,
      result.tokens.cacheWrite,
      result.tokens.webSearches,
      result.cost,
      result.durationMs,
      result.status,
      result.detail ?? "",
    ],
  );
}

export interface UsageSummary {
  timezone: string;
  today: Record<Category, { spent: number; limit: number; calls: number }>;
  todayTotal: number;
  monthTotal: number;
  allTimeTotal: number;
  credit: { balance: number | null; asOf: string | null; spentSince: number; remaining: number | null };
  counts: {
    jobsFoundToday: number;
    jobsScoredToday: number;
    docsToday: number;
    appliedThisWeek: number;
    unscored: number;
  };
  averages: { perScoredJob: number | null; perDocumentSet: number | null; perApplication: number | null };
  running: number;
}

export async function usageSummary(): Promise<UsageSummary> {
  const settings = await getSettings();
  const tz = settings.timezone;

  const todayRows = await query<{ category: Category; spent: number; calls: number }>(
    `SELECT category, SUM(cost_usd) AS spent, COUNT(*)::int AS calls FROM usage_log
     WHERE created_at >= ${TODAY_START} GROUP BY category`,
    [tz],
  );
  const today = Object.fromEntries(
    CATEGORIES.map((c) => {
      const r = todayRows.find((x) => x.category === c);
      return [c, { spent: Number(r?.spent ?? 0), limit: settings.limits[c], calls: Number(r?.calls ?? 0) }];
    }),
  ) as UsageSummary["today"];

  const totals = await queryOne<{ month: number | null; all_time: number | null; running: number }>(
    `SELECT SUM(cost_usd) FILTER (WHERE created_at >= ${MONTH_START}) AS month,
            SUM(cost_usd) AS all_time,
            COUNT(*) FILTER (WHERE status = 'running' AND created_at > now() - interval '10 minutes')::int AS running
     FROM usage_log`,
    [tz],
  );

  let spentSince = 0;
  if (settings.credit.asOf) {
    const r = await queryOne<{ total: number | null }>(
      `SELECT SUM(cost_usd) AS total FROM usage_log WHERE created_at >= $1`,
      [settings.credit.asOf],
    );
    spentSince = Number(r?.total ?? 0);
  }

  const counts = await queryOne<any>(
    `SELECT
       COUNT(*) FILTER (WHERE found_at >= ${TODAY_START})::int AS found_today,
       COUNT(*) FILTER (WHERE scored_at >= ${TODAY_START})::int AS scored_today,
       COUNT(*) FILTER (WHERE docs_generated_at >= ${TODAY_START})::int AS docs_today,
       COUNT(*) FILTER (WHERE status = 'applied' AND status_changed_at >= now() - interval '7 days')::int AS applied_week,
       COUNT(*) FILTER (WHERE score IS NULL AND status <> 'hidden')::int AS unscored
     FROM jobs`,
    [tz],
  );

  const avg = await queryOne<any>(
    `SELECT
       (SELECT SUM(cost_usd) FROM usage_log WHERE category = 'scoring') AS scoring_cost,
       (SELECT COUNT(*) FROM jobs WHERE score IS NOT NULL)::int AS scored_jobs,
       (SELECT AVG(cost_usd) FROM usage_log WHERE operation = 'write_documents' AND status = 'ok') AS doc_avg,
       (SELECT AVG(t.c) FROM (
          SELECT SUM(u.cost_usd) AS c FROM jobs j JOIN usage_log u ON u.job_id = j.id
          WHERE j.status IN ('applied','interview','offer','rejected') GROUP BY j.id) t) AS per_app`,
  );

  const sumToday = Object.values(today).reduce((s, x) => s + x.spent, 0);
  return {
    timezone: tz,
    today,
    todayTotal: sumToday,
    monthTotal: Number(totals?.month ?? 0),
    allTimeTotal: Number(totals?.all_time ?? 0),
    credit: {
      balance: settings.credit.balance,
      asOf: settings.credit.asOf,
      spentSince,
      remaining: settings.credit.balance == null ? null : settings.credit.balance - spentSince,
    },
    counts: {
      jobsFoundToday: counts.found_today,
      jobsScoredToday: counts.scored_today,
      docsToday: counts.docs_today,
      appliedThisWeek: counts.applied_week,
      unscored: counts.unscored,
    },
    averages: {
      perScoredJob: avg.scored_jobs > 0 ? Number(avg.scoring_cost ?? 0) / avg.scored_jobs : null,
      perDocumentSet: avg.doc_avg == null ? null : Number(avg.doc_avg),
      perApplication: avg.per_app == null ? null : Number(avg.per_app),
    },
    running: totals?.running ?? 0,
  };
}

export async function usageFeed(limit = 40) {
  return query(
    `SELECT u.id, u.created_at, u.category, u.operation, u.model, u.job_id, u.input_tokens, u.output_tokens,
            u.cache_read_tokens, u.cache_write_tokens, u.web_searches, u.cost_usd, u.duration_ms, u.status, u.detail,
            j.title AS job_title, j.company AS job_company
     FROM usage_log u LEFT JOIN jobs j ON j.id = u.job_id
     ORDER BY u.id DESC LIMIT $1`,
    [limit],
  );
}

export async function usageHistory() {
  const { timezone } = await getSettings();
  const daily = await query<{ day: string; category: Category; cost: number; calls: number }>(
    `SELECT to_char(created_at AT TIME ZONE $1, 'YYYY-MM-DD') AS day, category,
            SUM(cost_usd) AS cost, COUNT(*)::int AS calls
     FROM usage_log WHERE created_at >= now() - interval '31 days'
     GROUP BY 1, 2 ORDER BY 1 DESC`,
    [timezone],
  );
  const byModel = await query(
    `SELECT model, COUNT(*)::int AS calls, SUM(cost_usd) AS cost, SUM(input_tokens)::bigint AS input_tokens,
            SUM(output_tokens)::bigint AS output_tokens, SUM(cache_read_tokens)::bigint AS cache_read_tokens,
            SUM(web_searches)::int AS web_searches
     FROM usage_log GROUP BY model ORDER BY cost DESC NULLS LAST`,
  );
  const byOperation = await query(
    `SELECT category, operation, COUNT(*)::int AS calls, SUM(cost_usd) AS cost, AVG(cost_usd) AS avg_cost
     FROM usage_log GROUP BY 1, 2 ORDER BY cost DESC NULLS LAST`,
  );
  return {
    daily: daily.map((d) => ({ ...d, cost: Number(d.cost) })),
    byModel: byModel.map((m: any) => ({
      ...m,
      cost: Number(m.cost ?? 0),
      input_tokens: Number(m.input_tokens ?? 0),
      output_tokens: Number(m.output_tokens ?? 0),
      cache_read_tokens: Number(m.cache_read_tokens ?? 0),
    })),
    byOperation: byOperation.map((o: any) => ({ ...o, cost: Number(o.cost ?? 0), avg_cost: Number(o.avg_cost ?? 0) })),
  };
}
