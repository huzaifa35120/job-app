import { route } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { searchNow } from "@/lib/pipeline";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const search = await queryOne<any>(`SELECT * FROM searches WHERE id = $1`, [Number(id)]);
  if (!search) throw new Error("Search not found");
  return {
    result: await searchNow({
      id: search.id,
      label: search.keywords,
      keywords: search.keywords,
      scope: search.scope,
      location: search.location,
    }),
  };
});
