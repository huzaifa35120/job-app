import { route } from "@/lib/api";
import { hasApiKey } from "@/lib/claude";
import { query } from "@/lib/db";
import { officialCost } from "@/lib/official";
import { getProfile, profileIsEmpty } from "@/lib/profile";
import { getSettings } from "@/lib/settings";
import { adzunaConfigured } from "@/lib/sources/free";
import { usageFeed, usageSummary } from "@/lib/usage";

/** Dashboard data: today's spend per category, totals, live feed, setup checklist. */
export const GET = route(async (req) => {
  const withOfficial = new URL(req.url).searchParams.get("official") === "1";
  const [summary, feed, settings, profile, searches] = await Promise.all([
    usageSummary(),
    usageFeed(40),
    getSettings(),
    getProfile(),
    query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM searches WHERE active`),
  ]);
  const setup = [
    { ok: hasApiKey(), text: "Anthropic API key (ANTHROPIC_API_KEY)" },
    { ok: !profileIsEmpty(profile), text: "Profile filled in (upload your resume on the Profile page)" },
    { ok: profile.targetRoles.length > 0 || searches[0].n > 0, text: "At least one target role or saved keyword search" },
    { ok: adzunaConfigured() || !settings.sources.adzuna, text: "Adzuna keys for Australian jobs (optional, free)" },
    { ok: settings.credit.balance != null, text: "Credit balance entered in Settings (for the 'remaining' figure)" },
    { ok: Boolean(process.env.CRON_SECRET) || !process.env.VERCEL, text: "CRON_SECRET set (needed for the daily automatic search)" },
  ];
  return {
    summary,
    feed: feed.map((f: any) => ({ ...f, cost_usd: Number(f.cost_usd) })),
    setup,
    official: withOfficial ? await officialCost() : undefined,
  };
});
