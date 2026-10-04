import { readJson, route } from "@/lib/api";
import { query } from "@/lib/db";
import { getJob, updateJob } from "@/lib/jobs";
import { profileUpdatedAt } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const id = Number((await params).id);
  const job = await getJob(id);
  if (!job) throw new Error("Job not found");
  const usage = await query(
    `SELECT id, created_at, category, operation, model, cost_usd, status, detail FROM usage_log WHERE job_id = $1 ORDER BY id DESC`,
    [id],
  );
  const scoringCost = Number((job.score_details as any)?.cost ?? 0);
  const cost = usage.reduce((s: number, u: any) => s + Number(u.cost_usd), 0) + scoringCost;
  return { job, usage, cost, scoringCost, profileUpdatedAt: await profileUpdatedAt() };
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = Number((await params).id);
  const body = await readJson(req);
  return { job: await updateJob(id, body) };
});
