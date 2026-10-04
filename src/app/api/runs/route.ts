import { route } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = route(async () => ({
  runs: await query(
    `SELECT id, kind, started_at, finished_at, status, summary, log FROM runs ORDER BY id DESC LIMIT 15`,
  ),
}));
