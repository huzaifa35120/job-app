import { route } from "@/lib/api";
import { query } from "@/lib/db";
import { usageHistory } from "@/lib/usage";

export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(500, Number(p.get("limit") ?? 200));
  const ledger = await query(
    `SELECT u.*, j.title AS job_title, j.company AS job_company
     FROM usage_log u LEFT JOIN jobs j ON j.id = u.job_id ORDER BY u.id DESC LIMIT $1`,
    [limit],
  );
  return { ...(await usageHistory()), ledger: ledger.map((l: any) => ({ ...l, cost_usd: Number(l.cost_usd) })) };
});
