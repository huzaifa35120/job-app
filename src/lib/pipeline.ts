// Orchestrates searching, matching and document writing, within Vercel's 300s limit and the daily spend limits.

import { scoreJobs, writeDocuments } from "./ai";
import { hasApiKey } from "./claude";
import { query, queryOne } from "./db";
import { insertJobs, prefilter, type JobRow } from "./jobs";
import { getProfile, profileIsEmpty } from "./profile";
import { getSettings, type Scope, type Settings } from "./settings";
import type { JobInput } from "./sources/common";
import { adzuna, adzunaConfigured, companyBoard, himalayas, jobicy, remoteOk, remotive } from "./sources/free";
import { webSearchJobs } from "./sources/websearch";
import { LimitReachedError } from "./usage";

export interface SearchSpec {
  id: number | null;
  label: string;
  keywords: string;
  scope: Scope;
  location: string;
}

interface Ctx {
  deadline: number;
  log: string[];
  settings: Settings;
  companyJobs?: JobInput[];
  webSearchBlocked?: boolean;
  newJobIds: number[];
}

const secondsLeft = (ctx: Ctx) => (ctx.deadline - Date.now()) / 1000;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

// ------------------------------------------------------------------ locking + run log

async function acquireLock(seconds: number): Promise<boolean> {
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const row = await queryOne(
    `INSERT INTO kv (key, value) VALUES ('lock:pipeline', jsonb_build_object('until', $1::text))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     WHERE (kv.value->>'until')::timestamptz < now()
     RETURNING key`,
    [until],
  );
  return Boolean(row);
}

async function releaseLock() {
  await query(`DELETE FROM kv WHERE key = 'lock:pipeline'`);
}

export class BusyError extends Error {
  constructor() {
    super("Another search or writing run is in progress. Try again in a few minutes.");
  }
}

async function withRun<T extends Record<string, unknown>>(
  kind: string,
  budgetSeconds: number,
  fn: (ctx: Ctx) => Promise<T>,
): Promise<T & { runId: number; log: string[]; spent: number }> {
  if (!(await acquireLock(budgetSeconds + 30))) throw new BusyError();
  const run = await queryOne<{ id: number; started_at: string }>(
    `INSERT INTO runs (kind) VALUES ($1) RETURNING id, started_at`,
    [kind],
  );
  const ctx: Ctx = { deadline: Date.now() + budgetSeconds * 1000, log: [], settings: await getSettings(), newJobIds: [] };
  try {
    const result = await fn(ctx);
    const spentRow = await queryOne<{ s: number | null }>(
      `SELECT SUM(cost_usd) AS s FROM usage_log WHERE created_at >= $1`,
      [run!.started_at],
    );
    const spent = Number(spentRow?.s ?? 0);
    await query(`UPDATE runs SET finished_at = now(), status = 'ok', summary = $2::jsonb, log = $3 WHERE id = $1`, [
      run!.id,
      JSON.stringify({ ...result, spent }),
      ctx.log.join("\n"),
    ]);
    return { ...result, runId: run!.id, log: ctx.log, spent };
  } catch (err) {
    ctx.log.push(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    await query(`UPDATE runs SET finished_at = now(), status = 'error', log = $2 WHERE id = $1`, [run!.id, ctx.log.join("\n")]);
    throw err;
  } finally {
    await releaseLock();
  }
}

// ------------------------------------------------------------------ searching

async function loadCompanyJobs(ctx: Ctx): Promise<JobInput[]> {
  if (ctx.companyJobs) return ctx.companyJobs;
  const all: JobInput[] = [];
  if (ctx.settings.sources.companies) {
    const results = await Promise.allSettled(ctx.settings.watchedCompanies.map((c) => companyBoard(c)));
    results.forEach((r, i) => {
      const c = ctx.settings.watchedCompanies[i];
      if (r.status === "fulfilled") all.push(...r.value);
      else ctx.log.push(`Company board ${c.ats}:${c.slug} failed: ${r.reason?.message ?? r.reason}`);
    });
  }
  ctx.companyJobs = all;
  return all;
}

export async function runOneSearch(ctx: Ctx, spec: SearchSpec) {
  const { settings } = ctx;
  const wantsAU = spec.scope !== "remote";
  const wantsRemote = spec.scope !== "australia";
  const tasks: { name: string; run: () => Promise<JobInput[]> }[] = [];
  const q = { keywords: spec.keywords, location: spec.location };

  if (wantsAU && settings.sources.adzuna) {
    if (!adzunaConfigured()) {
      if (!ctx.log.some((l) => l.startsWith("Adzuna"))) {
        ctx.log.push("Adzuna (Australia) skipped: ADZUNA_APP_ID / ADZUNA_APP_KEY not set.");
      }
    } else {
      const locations = spec.location ? [spec.location] : settings.australiaLocations.length ? settings.australiaLocations : [""];
      for (const location of locations) {
        tasks.push({ name: `Adzuna${location ? ` (${location})` : ""}`, run: () => adzuna({ ...q, location }, settings.maxAgeDays) });
      }
    }
  }
  if (wantsRemote) {
    if (settings.sources.remotive) tasks.push({ name: "Remotive", run: () => remotive(q) });
    if (settings.sources.jobicy) tasks.push({ name: "Jobicy", run: () => jobicy(q) });
    if (settings.sources.himalayas) tasks.push({ name: "Himalayas", run: () => himalayas(q) });
    if (settings.sources.remoteok) tasks.push({ name: "Remote OK", run: () => remoteOk() });
  }

  const fetched: JobInput[] = [];
  const errors: string[] = [];
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") fetched.push(...r.value);
    else errors.push(`${tasks[i].name}: ${r.reason?.message ?? r.reason}`);
  });

  const { kept, stats } = prefilter(fetched, spec.keywords, settings);
  const companyJobs = prefilter(await loadCompanyJobs(ctx), spec.keywords, settings, { requireAustraliaOrRemote: true });
  kept.push(
    ...companyJobs.kept.filter((j) => (j.remote ? wantsRemote : wantsAU)),
  );

  // AI web search (paid) for scopes enabled in Settings.
  let webFound = 0;
  if (settings.sources.webSearch && !ctx.webSearchBlocked && hasApiKey() && secondsLeft(ctx) > 90) {
    const scopes: ("australia" | "remote")[] = [];
    if (wantsAU && settings.webSearchScope !== "remote") scopes.push("australia");
    if (wantsRemote && settings.webSearchScope !== "australia") scopes.push("remote");
    for (const scope of scopes) {
      try {
        const location = scope === "australia" ? spec.location || settings.australiaLocations[0] || "" : "";
        const found = await webSearchJobs({ keywords: spec.keywords, scope, location }, settings);
        const filtered = prefilter(found, spec.keywords, settings).kept;
        webFound += filtered.length;
        kept.push(...filtered);
      } catch (err) {
        if (err instanceof LimitReachedError) {
          ctx.webSearchBlocked = true;
          ctx.log.push(`AI web search stopped: ${err.message}`);
          break;
        }
        errors.push(`AI web search: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const ids = await insertJobs(kept, { id: spec.id, label: spec.label });
  ctx.newJobIds.push(...ids);
  if (spec.id) {
    await query(`UPDATE searches SET last_run_at = now(), last_found = $2 WHERE id = $1`, [spec.id, ids.length]);
  }
  const removed = Object.entries(stats)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  const name = spec.label === spec.keywords ? spec.label : `${spec.label}: ${spec.keywords}`;
  ctx.log.push(
    `${name}: fetched ${fetched.length + companyJobs.kept.length + webFound} (web search ${webFound}), ` +
      `filtered out ${removed || "none"}, ${ids.length} new.`,
  );
  for (const e of errors) ctx.log.push(`  ! ${e}`);
  return { label: name, fetched: fetched.length, kept: kept.length, inserted: ids.length, errors };
}

async function dailySearchSpecs(settings: Settings): Promise<SearchSpec[]> {
  const specs: SearchSpec[] = [];
  if (settings.recommended.enabled) {
    const profile = await getProfile();
    for (const role of profile.targetRoles.slice(0, 5)) {
      if (role.trim()) {
        specs.push({ id: null, label: "Recommended", keywords: role.trim(), scope: settings.recommended.scope, location: "" });
      }
    }
  }
  const saved = await query<{ id: number; keywords: string; scope: Scope; location: string }>(
    `SELECT id, keywords, scope, location FROM searches WHERE active ORDER BY id`,
  );
  for (const s of saved) specs.push({ id: s.id, label: s.keywords, keywords: s.keywords, scope: s.scope, location: s.location });
  return specs;
}

// ------------------------------------------------------------------ matching + writing

async function scoreUnscored(ctx: Ctx, opts: { onlyIds?: number[]; max?: number } = {}) {
  if (!hasApiKey()) {
    ctx.log.push("Matching skipped: ANTHROPIC_API_KEY not set.");
    return 0;
  }
  const profile = await getProfile();
  if (profileIsEmpty(profile)) {
    ctx.log.push("Matching skipped: fill in your Profile first.");
    return 0;
  }
  const max = opts.max ?? ctx.settings.maxScorePerRun;
  const attempted: number[] = [];
  let scored = 0;
  let stop = false;
  while (!stop && scored < max && secondsLeft(ctx) > 40) {
    const jobs = await query<JobRow>(
      `SELECT * FROM jobs WHERE score IS NULL AND status <> 'hidden' AND NOT (id = ANY($1::int[]))
       ${opts.onlyIds ? "AND id = ANY($3::int[])" : ""}
       ORDER BY found_at DESC LIMIT $2`,
      opts.onlyIds ? [attempted, Math.min(15, max - scored), opts.onlyIds] : [attempted, Math.min(15, max - scored)],
    );
    if (!jobs.length) break;
    attempted.push(...jobs.map((j) => j.id));
    const batches: JobRow[][] = [];
    for (let i = 0; i < jobs.length; i += 5) batches.push(jobs.slice(i, i + 5));
    await mapLimit(batches, 3, async (batch) => {
      if (stop) return;
      try {
        const n = await scoreJobs(batch, profile, ctx.settings);
        scored += n;
      } catch (err) {
        if (err instanceof LimitReachedError) {
          stop = true;
          ctx.log.push(`Matching stopped: ${err.message}`);
        } else ctx.log.push(`  ! Matching batch failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
  ctx.log.push(`Matched ${scored} job${scored === 1 ? "" : "s"}.`);
  return scored;
}

async function autoDocuments(ctx: Ctx, opts: { onlyIds?: number[] } = {}) {
  const { autoGenerate, timezone } = ctx.settings;
  if (!autoGenerate.enabled) return 0;
  if (!hasApiKey()) return 0;
  const profile = await getProfile();
  if (profileIsEmpty(profile)) return 0;

  const done = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM jobs WHERE docs_auto
     AND docs_generated_at >= (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1)`,
    [timezone],
  );
  const remaining = autoGenerate.maxPerDay - (done?.n ?? 0);
  if (remaining <= 0) {
    ctx.log.push(`Auto-writing skipped: already wrote ${done?.n} set(s) today (max ${autoGenerate.maxPerDay}).`);
    return 0;
  }
  const jobs = await query<JobRow>(
    `SELECT * FROM jobs WHERE score >= $1 AND resume IS NULL AND status IN ('new','shortlisted')
     AND found_at > now() - interval '7 days' ${opts.onlyIds ? "AND id = ANY($3::int[])" : ""}
     ORDER BY score DESC LIMIT $2`,
    opts.onlyIds ? [autoGenerate.minScore, remaining, opts.onlyIds] : [autoGenerate.minScore, remaining],
  );
  let written = 0;
  let stop = false;
  await mapLimit(jobs, 2, async (job) => {
    if (stop || secondsLeft(ctx) < 100) return;
    try {
      await writeDocuments(job, profile, ctx.settings, true);
      written++;
    } catch (err) {
      if (err instanceof LimitReachedError) {
        stop = true;
        ctx.log.push(`Auto-writing stopped: ${err.message}`);
      } else ctx.log.push(`  ! Writing failed for "${job.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  if (jobs.length) ctx.log.push(`Wrote resume + cover letter for ${written} top match${written === 1 ? "" : "es"}.`);
  return written;
}

// ------------------------------------------------------------------ entry points

/** Cron 1 (morning): run every saved + recommended search, then start matching. */
export function dailySearch() {
  return withRun("daily-search", 270, async (ctx) => {
    const specs = await dailySearchSpecs(ctx.settings);
    if (!specs.length) ctx.log.push("No searches yet: add target roles in Profile or a keyword search on the Jobs page.");
    const searches = [];
    for (const spec of specs) {
      if (secondsLeft(ctx) < 60) {
        ctx.log.push(`Out of time; skipped "${spec.keywords}" (runs tomorrow).`);
        continue;
      }
      searches.push(await runOneSearch(ctx, spec));
    }
    const scored = await scoreUnscored(ctx);
    return { searches, newJobs: ctx.newJobIds.length, scored };
  });
}

/** Cron 2 (an hour later): finish matching, then write documents for the best matches. */
export function dailyFinish() {
  return withRun("daily-finish", 270, async (ctx) => {
    const scored = await scoreUnscored(ctx, { max: ctx.settings.maxScorePerRun });
    const documents = await autoDocuments(ctx);
    return { scored, documents };
  });
}

/** "Search now" from the Jobs page: one search, match the new results, write documents for the top ones. */
export function searchNow(spec: SearchSpec) {
  return withRun("search-now", 270, async (ctx) => {
    const search = await runOneSearch(ctx, spec);
    const scored = await scoreUnscored(ctx, { onlyIds: ctx.newJobIds });
    const documents = secondsLeft(ctx) > 120 ? await autoDocuments(ctx, { onlyIds: ctx.newJobIds }) : 0;
    return { search, newJobs: ctx.newJobIds.length, scored, documents };
  });
}

export function runAllSearchesNow() {
  return dailySearch();
}

export function scoreNow() {
  return withRun("score-now", 270, async (ctx) => ({ scored: await scoreUnscored(ctx) }));
}

export function documentsNow() {
  return withRun("documents-now", 270, async (ctx) => ({ documents: await autoDocuments(ctx) }));
}
