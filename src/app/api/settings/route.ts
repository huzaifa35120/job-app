import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { hasApiKey } from "@/lib/claude";
import { MODEL_PRICES } from "@/lib/pricing";
import { CATEGORIES, CATEGORY_LABELS, getSettings, saveSettings } from "@/lib/settings";
import { adzunaConfigured } from "@/lib/sources/free";

const money = z.coerce.number().min(0).max(1000);
const scope = z.enum(["australia", "remote", "both"]);
const modelId = z.string().refine((m) => m in MODEL_PRICES, "Unknown model");

const SettingsSchema = z.object({
  timezone: z.string().min(1),
  limits: z.object(Object.fromEntries(CATEGORIES.map((c) => [c, money])) as Record<(typeof CATEGORIES)[number], typeof money>),
  models: z.object(Object.fromEntries(CATEGORIES.map((c) => [c, modelId])) as Record<(typeof CATEGORIES)[number], typeof modelId>),
  sources: z.object({
    adzuna: z.boolean(),
    remotive: z.boolean(),
    remoteok: z.boolean(),
    jobicy: z.boolean(),
    himalayas: z.boolean(),
    companies: z.boolean(),
    webSearch: z.boolean(),
  }),
  webSearchScope: scope,
  webSearchMaxSearches: z.coerce.number().int().min(1).max(10),
  australiaLocations: z.array(z.string().trim()).transform((a) => a.filter(Boolean)),
  maxAgeDays: z.coerce.number().int().min(1).max(60),
  excludeTitleWords: z.array(z.string().trim()).transform((a) => a.filter(Boolean)),
  remoteRegionsAllowed: z.array(z.string().trim()).transform((a) => a.filter(Boolean)),
  recommended: z.object({ enabled: z.boolean(), scope }),
  maxScorePerRun: z.coerce.number().int().min(1).max(300),
  autoGenerate: z.object({
    enabled: z.boolean(),
    minScore: z.coerce.number().int().min(0).max(100),
    maxPerDay: z.coerce.number().int().min(0).max(50),
  }),
  watchedCompanies: z.array(z.object({ ats: z.enum(["greenhouse", "lever", "ashby"]), slug: z.string().trim().min(1) })),
  credit: z.object({ balance: z.coerce.number().min(0).nullable(), asOf: z.string().nullable() }),
});

function meta() {
  return {
    categories: CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
    models: Object.entries(MODEL_PRICES)
      .filter(([, p]) => p.selectable)
      .map(([id, p]) => ({ id, label: `${p.label} — $${p.input}/$${p.output} per M tokens` })),
    env: {
      anthropic: hasApiKey(),
      adzuna: adzunaConfigured(),
      cron: Boolean(process.env.CRON_SECRET),
      adminKey: Boolean(process.env.ANTHROPIC_ADMIN_KEY),
      database: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL) ? "neon" : "local",
    },
  };
}

export const GET = route(async () => ({ settings: await getSettings(), meta: meta() }));

export const PUT = route(async (req) => {
  const body = await readJson(req);
  const parsed = SettingsSchema.parse(body.settings);
  return { settings: await saveSettings(parsed), meta: meta() };
});
