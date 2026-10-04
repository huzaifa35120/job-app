import { extOptions, extRoute, readJson } from "@/lib/api";
import { query, queryOne } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { EXTENSION_TOKEN_DAYS, createExtensionToken, credentialsMatch } from "@/lib/session";

export const OPTIONS = extOptions();

/** The extension logs in with your app username and password and gets a 90-day token back. */
export const POST = extRoute(
  async (req) => {
    const { username = "", password = "" } = await readJson(req);
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM login_attempts WHERE ip = $1 AND NOT success AND created_at > now() - interval '15 minutes'`,
      [ip],
    );
    if ((recent?.n ?? 0) >= 5) return Response.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
    const ok = await credentialsMatch(String(username), String(password));
    await query(`INSERT INTO login_attempts (ip, success) VALUES ($1, $2)`, [ip, ok]);
    if (!ok) return Response.json({ error: "Wrong username or password." }, { status: 401 });
    const profile = await getProfile();
    return {
      token: await createExtensionToken(String(username)),
      expiresInDays: EXTENSION_TOKEN_DAYS,
      name: profile.personal.fullName,
    };
  },
  { public: true },
);
