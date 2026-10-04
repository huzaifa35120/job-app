import { route } from "@/lib/api";
import { query } from "@/lib/db";
import { listJobs } from "@/lib/jobs";

export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const jobs = await listJobs({
    status: p.get("status") ?? undefined,
    minScore: p.get("minScore") ? Number(p.get("minScore")) : undefined,
    q: p.get("q") ?? undefined,
    searchLabel: p.get("search") ?? undefined,
    limit: p.get("limit") ? Math.min(500, Number(p.get("limit"))) : undefined,
  });
  const labels = await query<{ search_label: string; n: number }>(
    `SELECT search_label, COUNT(*)::int AS n FROM jobs WHERE status <> 'hidden' GROUP BY 1 ORDER BY 2 DESC`,
  );
  return { jobs: jobs.map((j: any) => ({ ...j, cost: Number(j.cost ?? 0) })), labels };
});
