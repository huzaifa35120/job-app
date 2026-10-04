import { kvGet, kvSet } from "./db";

export const CATEGORIES = ["search", "scoring", "documents", "apply", "profile"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  search: "Finding jobs (AI web search)",
  scoring: "Matching jobs to you",
  documents: "Resumes & cover letters",
  apply: "Application answers",
  profile: "Resume import",
};

export type Scope = "australia" | "remote" | "both";

export interface WatchedCompany {
  ats: "greenhouse" | "lever" | "ashby";
  slug: string;
}

export interface Settings {
  timezone: string;
  /** Daily spending limit in USD for each category. 0 disables that category. */
  limits: Record<Category, number>;
  models: Record<Category, string>;
  sources: {
    adzuna: boolean;
    remotive: boolean;
    remoteok: boolean;
    jobicy: boolean;
    himalayas: boolean;
    companies: boolean;
    webSearch: boolean;
  };
  /** Which searches may use AI web search (it costs money per search). */
  webSearchScope: Scope;
  webSearchMaxSearches: number;
  /** Australian cities/regions to search (Adzuna + web search). Empty = all of Australia. */
  australiaLocations: string[];
  maxAgeDays: number;
  excludeTitleWords: string[];
  /** A remote job is kept only if its location restriction is empty or mentions one of these. */
  remoteRegionsAllowed: string[];
  recommended: { enabled: boolean; scope: Scope };
  maxScorePerRun: number;
  autoGenerate: { enabled: boolean; minScore: number; maxPerDay: number };
  watchedCompanies: WatchedCompany[];
  credit: { balance: number | null; asOf: string | null };
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: "Australia/Sydney",
  limits: { search: 0.5, scoring: 0.5, documents: 2, apply: 0.5, profile: 0.5 },
  models: {
    search: "claude-opus-5",
    scoring: "claude-haiku-4-5",
    documents: "claude-opus-5",
    apply: "claude-opus-5",
    profile: "claude-opus-5",
  },
  sources: {
    adzuna: true,
    remotive: true,
    remoteok: true,
    jobicy: true,
    himalayas: true,
    companies: true,
    webSearch: true,
  },
  webSearchScope: "australia",
  webSearchMaxSearches: 3,
  australiaLocations: ["Sydney"],
  maxAgeDays: 14,
  excludeTitleWords: ["senior", "sr", "lead", "principal", "staff", "director", "head of", "vp"],
  remoteRegionsAllowed: ["worldwide", "anywhere", "global", "australia", "apac", "asia-pacific", "asia pacific", "oceania"],
  recommended: { enabled: true, scope: "both" },
  maxScorePerRun: 60,
  autoGenerate: { enabled: true, minScore: 75, maxPerDay: 3 },
  watchedCompanies: [],
  credit: { balance: null, asOf: null },
};

function merge<T>(defaults: T, value: any): T {
  if (Array.isArray(defaults)) return (Array.isArray(value) ? value : defaults) as T;
  if (defaults && typeof defaults === "object") {
    const out: any = { ...defaults };
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        out[key] = key in (defaults as any) ? merge((defaults as any)[key], value[key]) : value[key];
      }
    }
    return out;
  }
  return (value === undefined ? defaults : value) as T;
}

export async function getSettings(): Promise<Settings> {
  const stored = await kvGet<Partial<Settings>>("settings");
  return merge(DEFAULT_SETTINGS, stored ?? {});
}

export async function saveSettings(next: Settings): Promise<Settings> {
  const merged = merge(DEFAULT_SETTINGS, next);
  await kvSet("settings", merged);
  return merged;
}
