import { readJson, route } from "@/lib/api";
import { query, queryOne } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const body = await readJson(req);
  return {
    search: await queryOne(`UPDATE searches SET active = $2 WHERE id = $1 RETURNING *`, [Number(id), Boolean(body.active)]),
  };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  await query(`DELETE FROM searches WHERE id = $1`, [Number(id)]);
  return { ok: true };
});
