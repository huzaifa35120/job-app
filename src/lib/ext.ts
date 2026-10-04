// Helpers for the Chrome extension: which job is this page, and the documents to attach.

import type { TailoredResume } from "./ai";
import { kvGet, kvSet, query } from "./db";
import type { Profile } from "./profile";

export interface ExtJob {
  id: number;
  title: string;
  company: string;
  score: number | null;
  url: string;
  status: string;
  hasDocs: boolean;
}

const LAST_OPENED = "ext:last_opened";
const RECENT_MS = 6 * 3600_000;

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.host.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

const toExt = (j: any): ExtJob => ({
  id: j.id,
  title: j.title,
  company: j.company,
  score: j.score,
  url: j.url,
  status: j.status,
  hasDocs: Boolean(j.has_docs),
});

export async function rememberOpenedJob(jobId: number) {
  await kvSet(LAST_OPENED, { jobId, at: new Date().toISOString() });
}

export async function findJobForPage(page: { url: string; title: string; text: string }) {
  const jobs = await query(
    `SELECT id, title, company, url, score, status, (resume IS NOT NULL) AS has_docs
     FROM jobs WHERE status <> 'hidden' ORDER BY found_at DESC LIMIT 500`,
  );
  const here = normUrl(page.url);

  // 1. Same posting URL (or the apply page underneath it).
  if (here) {
    const byUrl = jobs.find((j: any) => {
      const u = normUrl(j.url);
      return u && (u === here || (u.split("/").length >= 3 && here.startsWith(u)));
    });
    if (byUrl) return { job: toExt(byUrl), how: "link" as const };
  }

  // 2. The job you just clicked "Apply" on in the app (its link often redirects to another site).
  const last = await kvGet<{ jobId: number; at: string }>(LAST_OPENED);
  if (last && Date.now() - Date.parse(last.at) < RECENT_MS) {
    const recent = jobs.find((j: any) => j.id === last.jobId);
    if (recent) return { job: toExt(recent), how: "recent" as const };
  }

  // 3. The page mentions the company and the job title.
  const hay = `${page.title}\n${page.text.slice(0, 30000)}`.toLowerCase();
  let best: { j: any; s: number } | null = null;
  for (const j of jobs as any[]) {
    let s = 0;
    if (j.company && j.company.length > 2 && hay.includes(j.company.toLowerCase())) s += 2;
    if (j.title && hay.includes(j.title.toLowerCase())) s += 3;
    if (s >= 5 && (!best || s > best.s)) best = { j, s };
  }
  if (best) return { job: toExt(best.j), how: "page" as const };
  return { job: null, how: "none" as const };
}

export async function candidateJobs(): Promise<ExtJob[]> {
  const rows = await query(
    `SELECT id, title, company, url, score, status, (resume IS NOT NULL) AS has_docs
     FROM jobs WHERE status IN ('new', 'shortlisted') OR resume IS NOT NULL
     ORDER BY (resume IS NOT NULL) DESC, status = 'shortlisted' DESC, score DESC NULLS LAST, found_at DESC LIMIT 25`,
  );
  return rows.map(toExt);
}

/** A plain (untailored) resume built straight from the profile, for jobs without tailored documents. */
export function profileAsResume(p: Profile): TailoredResume {
  return {
    headline: p.headline,
    summary: p.summary,
    skills: p.skills,
    experience: p.experience,
    projects: p.projects,
    education: p.education,
    certifications: p.certifications,
    extras: [...p.achievements, ...p.extras],
  };
}

export function letterAsText(letter: any, name: string): string {
  if (!letter) return "";
  return [letter.greeting, "", ...letter.paragraphs.flatMap((p: string) => [p, ""]), letter.sign_off, name].join("\n").trim();
}

export const fileSlug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "Resume";
