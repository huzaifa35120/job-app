import { extOptions, extRoute, readJson } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { dedupeKey } from "@/lib/jobs";
import { stripHtml } from "@/lib/sources/common";

export const OPTIONS = extOptions();

/** Adds the job on the current page to your list (for jobs found outside the app). */
export const POST = extRoute(async (req) => {
  const body = await readJson(req);
  const url = String(body.url ?? "");
  const title = String(body.title ?? "").trim().slice(0, 300);
  const company = String(body.company ?? "").trim().slice(0, 200);
  if (!/^https?:\/\//.test(url) || !title) throw new Error("Need the page link and a job title.");
  const description = stripHtml(String(body.description ?? "")).slice(0, 20000);
  const row = await queryOne<any>(
    `INSERT INTO jobs (source, external_id, dedupe_key, title, company, location, remote, url, description, full_description, search_label)
     VALUES ('extension', $1, $2, $3, $4, $5, false, $1, $6, $6, 'Added from browser')
     ON CONFLICT (source, external_id) DO UPDATE SET title = EXCLUDED.title
     RETURNING id, title, company, url, score, status, (resume IS NOT NULL) AS has_docs`,
    [url, dedupeKey(title, company), title, company, String(body.location ?? "").slice(0, 200), description],
  );
  return {
    job: { id: row.id, title: row.title, company: row.company, url: row.url, score: row.score, status: row.status, hasDocs: Boolean(row.has_docs) },
  };
});
