import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, credentialsMatch } from "@/lib/session";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export async function POST(req: Request) {
  try {
    const { username = "", password = "" } = await req.json().catch(() => ({}));
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";

    const recent = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM login_attempts
       WHERE ip = $1 AND NOT success AND created_at > now() - ($2 || ' minutes')::interval`,
      [ip, String(WINDOW_MINUTES)],
    );
    if ((recent?.n ?? 0) >= MAX_FAILURES) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes.` },
        { status: 429 },
      );
    }

    const ok = await credentialsMatch(String(username), String(password));
    await query(`INSERT INTO login_attempts (ip, success) VALUES ($1, $2)`, [ip, ok]);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600));
      return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(String(username)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
