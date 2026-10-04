export interface JobInput {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string;
  url: string;
  description: string;
  postedAt: Date | null;
  /** For remote jobs: where candidates must be based ("" if unrestricted/unknown). */
  remoteRestriction?: string;
  /** True when the source already filtered by the keywords (skip the title keyword check). */
  preMatched?: boolean;
}

export interface SearchQuery {
  keywords: string;
  /** City/region for Australian searches ("" = all of Australia). */
  location: string;
}

export const USER_AGENT = "AutoJobApply/1.0 (personal job search tool)";

export async function fetchJson<T = any>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function stripHtml(html: string): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol|section)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d =
    typeof value === "number" || /^\d+$/.test(String(value))
      ? new Date(Number(value) * (Number(value) < 1e12 ? 1000 : 1))
      : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSalary(min?: number | null, max?: number | null, currency = "", period = ""): string {
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const c = currency ? `${currency} ` : "";
  const p = period ? ` ${period}` : "";
  if (min && max && min !== max) return `${c}${fmt(min)}–${fmt(max)}${p}`;
  if (min || max) return `${c}${fmt((min || max)!)}${p}`;
  return "";
}
