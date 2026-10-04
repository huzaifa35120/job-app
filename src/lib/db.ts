// Database access. Uses Neon Postgres when DATABASE_URL is set (Vercel),
// otherwise an embedded Postgres (PGlite) stored in ./.data for local development.

type Row = Record<string, any>;

interface Executor {
  query(text: string, params?: unknown[]): Promise<Row[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (
     key TEXT PRIMARY KEY,
     value JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS searches (
     id SERIAL PRIMARY KEY,
     keywords TEXT NOT NULL,
     scope TEXT NOT NULL DEFAULT 'both',
     location TEXT NOT NULL DEFAULT '',
     active BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_run_at TIMESTAMPTZ,
     last_found INT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS jobs (
     id SERIAL PRIMARY KEY,
     source TEXT NOT NULL,
     external_id TEXT NOT NULL,
     dedupe_key TEXT NOT NULL,
     title TEXT NOT NULL,
     company TEXT NOT NULL DEFAULT '',
     location TEXT NOT NULL DEFAULT '',
     remote BOOLEAN NOT NULL DEFAULT false,
     salary TEXT NOT NULL DEFAULT '',
     url TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     full_description TEXT,
     posted_at TIMESTAMPTZ,
     found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     search_id INT,
     search_label TEXT NOT NULL DEFAULT '',
     score INT,
     verdict TEXT,
     score_reason TEXT,
     score_details JSONB,
     scored_at TIMESTAMPTZ,
     status TEXT NOT NULL DEFAULT 'new',
     status_changed_at TIMESTAMPTZ,
     notes TEXT NOT NULL DEFAULT '',
     resume JSONB,
     cover_letter JSONB,
     doc_notes JSONB,
     docs_generated_at TIMESTAMPTZ,
     docs_auto BOOLEAN NOT NULL DEFAULT false,
     answers JSONB,
     UNIQUE (source, external_id)
   )`,
  `CREATE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs (dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS jobs_score_idx ON jobs (score DESC NULLS LAST)`,
  `CREATE TABLE IF NOT EXISTS usage_log (
     id SERIAL PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     category TEXT NOT NULL,
     operation TEXT NOT NULL,
     model TEXT NOT NULL,
     job_id INT,
     input_tokens INT NOT NULL DEFAULT 0,
     output_tokens INT NOT NULL DEFAULT 0,
     cache_read_tokens INT NOT NULL DEFAULT 0,
     cache_write_tokens INT NOT NULL DEFAULT 0,
     web_searches INT NOT NULL DEFAULT 0,
     cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
     duration_ms INT,
     status TEXT NOT NULL DEFAULT 'running',
     detail TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS usage_created_idx ON usage_log (created_at)`,
  `CREATE TABLE IF NOT EXISTS runs (
     id SERIAL PRIMARY KEY,
     kind TEXT NOT NULL,
     started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     finished_at TIMESTAMPTZ,
     status TEXT NOT NULL DEFAULT 'running',
     summary JSONB,
     log TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
     id SERIAL PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     ip TEXT NOT NULL DEFAULT '',
     success BOOLEAN NOT NULL
   )`,
];

const globalForDb = globalThis as unknown as { __ajaDb?: Promise<Executor> };

async function createExecutor(): Promise<Executor> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let exec: Executor;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    exec = { query: async (text, params = []) => (await sql.query(text, params as any[])) as Row[] };
  } else {
    if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL is not set. In Vercel open Storage → Create Database → Neon, connect it to this project, then redeploy.",
      );
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const dir = process.env.PGLITE_DIR || "./.data/pglite";
    mkdirSync(dirname(dir), { recursive: true });
    const db = new PGlite(dir);
    exec = { query: async (text, params = []) => (await db.query<Row>(text, params as any[])).rows };
  }
  for (const statement of SCHEMA) await exec.query(statement);
  return exec;
}

function executor(): Promise<Executor> {
  if (!globalForDb.__ajaDb) {
    globalForDb.__ajaDb = createExecutor().catch((err) => {
      globalForDb.__ajaDb = undefined;
      throw err;
    });
  }
  return globalForDb.__ajaDb;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const exec = await executor();
  return (await exec.query(text, params)) as T[];
}

export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await queryOne<{ value: T }>("SELECT value FROM kv WHERE key = $1", [key]);
  return row ? row.value : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO kv (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
