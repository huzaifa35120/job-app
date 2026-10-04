import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { searchNow } from "@/lib/pipeline";

export const maxDuration = 300;

const NewSearch = z.object({
  keywords: z.string().trim().min(2).max(100),
  scope: z.enum(["australia", "remote", "both"]),
  location: z.string().trim().max(100).default(""),
  daily: z.boolean().default(true),
  runNow: z.boolean().default(true),
});

export const GET = route(async () => ({
  searches: await query(`SELECT * FROM searches ORDER BY active DESC, id DESC`),
}));

/** Saves a keyword search and (by default) runs it immediately. */
export const POST = route(async (req) => {
  const input = NewSearch.parse(await readJson(req));
  let search = await queryOne<any>(
    `SELECT * FROM searches WHERE lower(keywords) = lower($1) AND scope = $2 AND lower(location) = lower($3)`,
    [input.keywords, input.scope, input.location],
  );
  if (!search) {
    search = await queryOne(
      `INSERT INTO searches (keywords, scope, location, active) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.keywords, input.scope, input.location, input.daily],
    );
  } else if (input.daily && !search.active) {
    search = await queryOne(`UPDATE searches SET active = true WHERE id = $1 RETURNING *`, [search.id]);
  }
  if (!input.runNow) return { search };
  const result = await searchNow({
    id: search.id,
    label: search.keywords,
    keywords: search.keywords,
    scope: search.scope,
    location: search.location,
  });
  return { search, result };
});
