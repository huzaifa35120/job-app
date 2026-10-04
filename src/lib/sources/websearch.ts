// AI web search: Claude searches the web (Seek, LinkedIn, Indeed, company sites...) for postings.
// Costs money ($0.01 per search plus tokens), so it has its own daily limit ("search").

import { z } from "zod";
import { callClaude } from "../claude";
import type { Scope, Settings } from "../settings";
import { toDate, type JobInput } from "./common";

const FoundJobs = z.object({
  jobs: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      url: z.string(),
      remote: z.boolean(),
      summary: z.string(),
      posted: z.string(),
    }),
  ),
});

const SAVE_JOBS_TOOL = {
  name: "save_jobs",
  description: "Save the job postings you found. Call this exactly once, at the end, with every posting you found.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      jobs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            url: { type: "string", description: "Direct URL of the job posting, exactly as seen in search results" },
            remote: { type: "boolean" },
            summary: {
              type: "string",
              description: "2-4 sentences: what the role does and its key requirements (skills, years of experience, work rights)",
            },
            posted: { type: "string", description: "Posting date as YYYY-MM-DD if known, otherwise empty string" },
          },
          required: ["title", "company", "location", "url", "remote", "summary", "posted"],
          additionalProperties: false,
        },
      },
    },
    required: ["jobs"],
    additionalProperties: false,
  },
};

export async function webSearchJobs(
  opts: { keywords: string; scope: Exclude<Scope, "both">; location: string },
  settings: Settings,
): Promise<JobInput[]> {
  const maxUses = Math.max(1, Math.min(10, settings.webSearchMaxSearches));
  const where =
    opts.scope === "australia"
      ? `located in ${opts.location ? `${opts.location}, ` : ""}Australia`
      : "that are fully remote and open to candidates living in Australia";

  const { response } = await callClaude({
    category: "search",
    operation: "web_search",
    model: settings.models.search,
    detail: `Web search: ${opts.keywords} (${opts.scope}${opts.location ? `, ${opts.location}` : ""})`,
    system:
      "You find real, currently open job postings using web search. Only include postings you actually saw in " +
      "search results, with their real posting URL. Never invent jobs, companies or URLs. If you find nothing, save an empty list.",
    messages: [
      {
        role: "user",
        content:
          `Find up to 15 currently open job postings for "${opts.keywords}" ${where}. ` +
          `Look on job boards such as Seek (seek.com.au), LinkedIn, Indeed, Jora and company careers pages. ` +
          `Prefer postings from the last ${settings.maxAgeDays} days and entry-level to mid-level roles. ` +
          `Skip expired postings and generic recruiter ads. When you are done searching, call save_jobs once with everything you found.`,
      },
    ],
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: maxUses,
        user_location: {
          type: "approximate",
          country: "AU",
          city: opts.location || "Sydney",
          timezone: settings.timezone,
        },
      },
      SAVE_JOBS_TOOL,
    ],
    maxTokens: 16000,
    effort: "low",
    expectedOutputTokens: 3000,
    estimatedInputTokens: 1500 + maxUses * 8000,
    expectedWebSearches: maxUses,
  });

  const call = response.content.find((b) => b.type === "tool_use" && b.name === "save_jobs");
  if (!call || call.type !== "tool_use") return [];
  const parsed = FoundJobs.safeParse(call.input);
  if (!parsed.success) return [];

  return parsed.data.jobs
    .filter((j) => /^https?:\/\//.test(j.url) && j.title)
    .map(
      (j): JobInput => ({
        source: "websearch",
        externalId: j.url,
        title: j.title,
        company: j.company,
        location: j.remote ? `Remote (${j.location || "Australia"})` : j.location,
        remote: j.remote,
        salary: "",
        url: j.url,
        description: j.summary,
        postedAt: toDate(j.posted),
        preMatched: true,
      }),
    );
}
