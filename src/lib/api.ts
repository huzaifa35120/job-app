import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ClaudeError } from "./claude";
import { BusyError } from "./pipeline";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { LimitReachedError } from "./usage";

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

function errorResponse(err: unknown) {
  if (err instanceof LimitReachedError) return NextResponse.json({ error: err.message, limit: true }, { status: 429 });
  if (err instanceof BusyError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: `Invalid data: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }, { status: 400 });
  }
  if (err instanceof ClaudeError) return NextResponse.json({ error: err.message }, { status: 502 });
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

/** Wraps a route handler: requires a valid session and turns errors into JSON. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!(await verifySessionToken(token))) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
      const result = await fn(req, ctx);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ------------------------------------------------------------------ Chrome extension API

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origin.startsWith("chrome-extension://")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function withCors(res: Response, req: Request): Response {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  return res;
}

/** Wraps an extension route: requires `Authorization: Bearer <extension token>`, adds CORS for chrome-extension:// origins. */
export function extRoute<C = unknown>(fn: Handler<C>, opts: { public?: boolean } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      if (!opts.public) {
        const { verifyExtensionToken } = await import("./session");
        const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!(await verifyExtensionToken(token))) {
          return withCors(NextResponse.json({ error: "The extension isn't connected. Log in again from the extension popup." }, { status: 401 }), req);
        }
      }
      const result = await fn(req, ctx);
      return withCors(result instanceof Response ? result : NextResponse.json(result ?? { ok: true }), req);
    } catch (err) {
      return withCors(errorResponse(err), req);
    }
  };
}

/** CORS preflight for extension routes. */
export function extOptions() {
  return async (req: Request) => withCors(new Response(null, { status: 204 }), req);
}

/** For Vercel Cron: requires `Authorization: Bearer $CRON_SECRET`. */
export function cronRoute(fn: () => Promise<unknown>) {
  return async (req: Request) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      return NextResponse.json(await fn());
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
