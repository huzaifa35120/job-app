import { query, queryOne } from "./db";
import type { Settings } from "./settings";
import { USER_AGENT, stripHtml, type JobInput } from "./sources/common";

export const JOB_STATUSES = ["new", "shortlisted", "applied", "interview", "offer", "rejected", "hidden"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRow {
  id: number;
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string;
  url: string;
  description: string;
  full_description: string | null;
  posted_at: string | null;
  found_at: string;
  search_id: number | null;
  search_label: string;
  score: number | null;
  verdict: string | null;
  score_reason: string | null;
  score_details: { matched: string[]; gaps: string[] } | null;
  scored_at: string | null;
  status: JobStatus;
  status_changed_at: string | null;
  notes: string;
  resume: any;
  cover_letter: any;
  doc_notes: any;
  docs_generated_at: string | null;
  resume_at: string | null;
  cover_at: string | null;
  answers: any;
}

const STOPWORDS = new Set(["and", "the", "for", "with", "job", "jobs", "role", "remote", "junior", "graduate", "entry", "level"]);

export function keywordTokens(keywords: string): string[] {
  return keywords
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

const AU_PLACES =
  /australia|\bau\b|sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|gold coast|newcastle|wollongong|geelong|\bnsw\b|\bvic\b|\bqld\b|\bact\b|\bwa\b|\bsa\b|\btas\b|\bnt\b/i;

export function dedupeKey(title: string, company: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(title)}|${norm(company)}`;
}

export interface FilterStats {
  irrelevant: number;
  excludedTitle: number;
  tooOld: number;
  wrongRegion: number;
  notAustralia: number;
}

/** Free, local filters applied before anything is stored (so we never pay to score junk). */
export function prefilter(
  jobs: JobInput[],
  keywords: string,
  settings: Settings,
  opts: { requireAustraliaOrRemote?: boolean } = {},
): { kept: JobInput[]; stats: FilterStats } {
  const tokens = keywordTokens(keywords);
  const stats: FilterStats = { irrelevant: 0, excludedTitle: 0, tooOld: 0, wrongRegion: 0, notAustralia: 0 };
  const cutoff = Date.now() - settings.maxAgeDays * 86_400_000;
  const excluded = settings.excludeTitleWords.map((w) => w.trim().toLowerCase()).filter(Boolean);
  const allowedRegions = settings.remoteRegionsAllowed.map((r) => r.trim().toLowerCase()).filter(Boolean);

  const kept = jobs.filter((job) => {
    const title = job.title.toLowerCase();
    if (!job.preMatched && tokens.length && !tokens.some((t) => title.includes(t))) {
      stats.irrelevant++;
      return false;
    }
    if (excluded.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(title))) {
      stats.excludedTitle++;
      return false;
    }
    if (job.postedAt && job.postedAt.getTime() < cutoff) {
      stats.tooOld++;
      return false;
    }
    if (job.remote && job.remoteRestriction) {
      const r = job.remoteRestriction.toLowerCase();
      if (!allowedRegions.some((a) => r.includes(a))) {
        stats.wrongRegion++;
        return false;
      }
    }
    if (opts.requireAustraliaOrRemote && !job.remote && !AU_PLACES.test(job.location)) {
      stats.notAustralia++;
      return false;
    }
    return true;
  });
  return { kept, stats };
}

/** Inserts jobs that aren't already stored (same source id, or same title+company from another source). */
export async function insertJobs(
  jobs: JobInput[],
  search: { id: number | null; label: string },
): Promise<number[]> {
  const ids: number[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    const key = dedupeKey(job.title, job.company);
    if (seen.has(key)) continue;
    seen.add(key);
    const dup = await queryOne("SELECT id FROM jobs WHERE dedupe_key = $1 LIMIT 1", [key]);
    if (dup) continue;
    const row = await queryOne<{ id: number }>(
      `INSERT INTO jobs (source, external_id, dedupe_key, title, company, location, remote, salary, url,
                         description, posted_at, search_id, search_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
      [
        job.source,
        job.externalId,
        key,
        job.title.slice(0, 300),
        job.company.slice(0, 200),
        job.location.slice(0, 300),
        job.remote,
        job.salary.slice(0, 100),
        job.url,
        job.description.slice(0, 20000),
        job.postedAt ? job.postedAt.toISOString() : null,
        search.id,
        search.label,
      ],
    );
    if (row) ids.push(row.id);
  }
  return ids;
}

export async function getJob(id: number): Promise<JobRow | null> {
  return queryOne<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
}

export interface JobListFilter {
  status?: string;
  minScore?: number;
  q?: string;
  searchLabel?: string;
  limit?: number;
}

export async function listJobs(f: JobListFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status === "active") where.push(`status IN ('new','shortlisted')`);
  else if (f.status === "pipeline") where.push(`status IN ('applied','interview','offer','rejected')`);
  else if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`status = $${params.length}`);
  } else where.push(`status <> 'hidden'`);
  if (f.minScore) {
    params.push(f.minScore);
    where.push(`score >= $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }
  if (f.searchLabel) {
    params.push(f.searchLabel);
    where.push(`search_label = $${params.length}`);
  }
  params.push(f.limit ?? 200);
  return query(
    `SELECT j.id, j.source, j.title, j.company, j.location, j.remote, j.salary, j.url, j.posted_at, j.found_at,
            j.search_label, j.score, j.verdict, j.score_reason, j.status, j.status_changed_at, j.docs_generated_at,
            (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_log u WHERE u.job_id = j.id)
              + COALESCE((j.score_details->>'cost')::float, 0) AS cost
     FROM jobs j WHERE ${where.join(" AND ")}
     ORDER BY j.score DESC NULLS LAST, j.found_at DESC LIMIT $${params.length}`,
    params,
  );
}

const UPDATABLE = ["status", "notes", "full_description", "cover_letter", "resume"];

export async function updateJob(
  id: number,
  patch: Partial<Pick<JobRow, "status" | "notes" | "full_description" | "cover_letter" | "resume">>,
) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !UPDATABLE.includes(key)) continue;
    if (key === "status" && !JOB_STATUSES.includes(value as JobStatus)) throw new Error(`Invalid status: ${value}`);
    params.push(key === "resume" || key === "cover_letter" ? JSON.stringify(value) : value);
    sets.push(`${key} = $${params.length}${key === "resume" || key === "cover_letter" ? "::jsonb" : ""}`);
    if (key === "status") sets.push("status_changed_at = now()");
  }
  if (!sets.length) return getJob(id);
  return queryOne<JobRow>(`UPDATE jobs SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, params);
}

export function jobDescription(job: JobRow): string {
  return (job.full_description && job.full_description.trim()) || job.description;
}

/** Free: downloads the posting page and extracts its text (works for most boards; some block bots). */
export async function fetchFullDescription(job: JobRow): Promise<string> {
  if (!/^https?:\/\//i.test(job.url)) throw new Error("This job has no web link.");
  const res = await fetch(job.url, {
    headers: { "User-Agent": `Mozilla/5.0 ${USER_AGENT}`, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`The job site returned HTTP ${res.status}. Paste the description manually instead.`);
  const html = await res.text();
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  const text = stripHtml(main.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " "));
  if (text.length < 300) throw new Error("Couldn't read the description from that page. Paste it manually instead.");
  return text.slice(0, 15000);
}
