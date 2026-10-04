// Free job sources. None of these call Claude, so they cost nothing.
// Each source asks to be credited: the app always shows the source name and links to the original posting.

import type { WatchedCompany } from "../settings";
import { fetchJson, formatSalary, stripHtml, toDate, type JobInput, type SearchQuery } from "./common";

export function adzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

/** Adzuna aggregates Australian job boards. Free key: https://developer.adzuna.com */
export async function adzuna(q: SearchQuery, maxAgeDays: number): Promise<JobInput[]> {
  if (!adzunaConfigured()) return [];
  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID!,
    app_key: process.env.ADZUNA_APP_KEY!,
    what: q.keywords,
    results_per_page: "50",
    max_days_old: String(maxAgeDays),
    sort_by: "date",
  });
  if (q.location) params.set("where", q.location);
  const data = await fetchJson<any>(`https://api.adzuna.com/v1/api/jobs/au/search/1?${params}`);
  return (data.results ?? []).map(
    (r: any): JobInput => ({
      source: "adzuna",
      externalId: String(r.id),
      title: stripHtml(r.title ?? ""),
      company: r.company?.display_name ?? "",
      location: r.location?.display_name ?? "Australia",
      remote: false,
      salary: formatSalary(r.salary_min, r.salary_max, "AUD", "/yr"),
      url: r.redirect_url ?? "",
      description: stripHtml(r.description ?? ""),
      postedAt: toDate(r.created),
      preMatched: true,
    }),
  );
}

/** https://remotive.com/api-documentation */
export async function remotive(q: SearchQuery): Promise<JobInput[]> {
  const data = await fetchJson<any>(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q.keywords)}&limit=100`,
  );
  return (data.jobs ?? []).map(
    (j: any): JobInput => ({
      source: "remotive",
      externalId: String(j.id),
      title: j.title ?? "",
      company: j.company_name ?? "",
      location: `Remote (${j.candidate_required_location || "anywhere"})`,
      remote: true,
      remoteRestriction: j.candidate_required_location ?? "",
      salary: j.salary ?? "",
      url: j.url ?? "",
      description: stripHtml(j.description ?? ""),
      postedAt: toDate(j.publication_date),
    }),
  );
}

/** https://jobicy.com/jobs-rss-feed */
export async function jobicy(q: SearchQuery): Promise<JobInput[]> {
  const data = await fetchJson<any>(
    `https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(q.keywords)}`,
  );
  return (data.jobs ?? []).map(
    (j: any): JobInput => ({
      source: "jobicy",
      externalId: String(j.id),
      title: stripHtml(j.jobTitle ?? ""),
      company: j.companyName ?? "",
      location: `Remote (${j.jobGeo || "anywhere"})`,
      remote: true,
      remoteRestriction: j.jobGeo ?? "",
      salary: formatSalary(j.salaryMin ?? j.annualSalaryMin, j.salaryMax ?? j.annualSalaryMax, j.salaryCurrency ?? ""),
      url: j.url ?? "",
      description: stripHtml(j.jobDescription || j.jobExcerpt || ""),
      postedAt: toDate(j.pubDate),
    }),
  );
}

/** https://himalayas.app/api — filtered to jobs open to candidates in Australia. */
export async function himalayas(q: SearchQuery): Promise<JobInput[]> {
  const data = await fetchJson<any>(
    `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q.keywords)}&country=Australia&limit=50`,
  );
  return (data.jobs ?? []).map((j: any): JobInput => {
    const restrictions: string[] = Array.isArray(j.locationRestrictions) ? j.locationRestrictions : [];
    const openToAustralia = restrictions.length === 0 || restrictions.some((r) => /australia/i.test(r));
    return {
      source: "himalayas",
      externalId: String(j.guid ?? j.applicationLink ?? `${j.companySlug}-${j.title}`),
      title: j.title ?? "",
      company: j.companyName ?? "",
      location: `Remote (${restrictions.length === 0 ? "anywhere" : openToAustralia ? "incl. Australia" : restrictions.slice(0, 3).join(", ")})`,
      remote: true,
      remoteRestriction: openToAustralia ? "" : restrictions.join(", "),
      salary: formatSalary(Number(j.minSalary) || null, Number(j.maxSalary) || null, j.currency && j.currency !== "None" ? j.currency : ""),
      url: j.applicationLink ?? j.guid ?? "",
      description: stripHtml(j.description || j.excerpt || ""),
      postedAt: toDate(j.pubDate),
    };
  });
}

let remoteOkCache: { at: number; jobs: JobInput[] } | null = null;

/** https://remoteok.com/api — returns the latest ~100 jobs; we filter by keyword ourselves. */
export async function remoteOk(): Promise<JobInput[]> {
  if (remoteOkCache && Date.now() - remoteOkCache.at < 10 * 60_000) return remoteOkCache.jobs;
  const data = await fetchJson<any[]>("https://remoteok.com/api");
  const jobs = data
    .filter((j) => j && j.id && j.position)
    .map(
      (j): JobInput => ({
        source: "remoteok",
        externalId: String(j.id),
        title: j.position,
        company: j.company ?? "",
        location: `Remote (${j.location || "anywhere"})`,
        remote: true,
        remoteRestriction: j.location ?? "",
        salary: formatSalary(Number(j.salary_min) || null, Number(j.salary_max) || null, "USD", "/yr"),
        url: j.url ?? j.apply_url ?? "",
        description: stripHtml(j.description ?? ""),
        postedAt: toDate(j.date),
      }),
    );
  remoteOkCache = { at: Date.now(), jobs };
  return jobs;
}

const titleCase = (slug: string) => slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Public job-board APIs of companies you add in Settings (Greenhouse, Lever, Ashby). */
export async function companyBoard(c: WatchedCompany): Promise<JobInput[]> {
  const slug = encodeURIComponent(c.slug.trim());
  const company = titleCase(c.slug.trim());
  if (c.ats === "greenhouse") {
    const data = await fetchJson<any>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return (data.jobs ?? []).map(
      (j: any): JobInput => ({
        source: `greenhouse:${c.slug}`,
        externalId: String(j.id),
        title: j.title ?? "",
        company: j.company_name || company,
        location: j.location?.name ?? "",
        remote: /remote/i.test(j.location?.name ?? ""),
        salary: "",
        url: j.absolute_url ?? "",
        description: stripHtml(stripHtml(j.content ?? "")),
        postedAt: toDate(j.first_published ?? j.updated_at),
      }),
    );
  }
  if (c.ats === "lever") {
    const data = await fetchJson<any[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return data.map(
      (j: any): JobInput => ({
        source: `lever:${c.slug}`,
        externalId: String(j.id),
        title: j.text ?? "",
        company,
        location: j.categories?.location ?? "",
        remote: j.workplaceType === "remote" || /remote/i.test(j.categories?.location ?? ""),
        salary: j.salaryRange ? formatSalary(j.salaryRange.min, j.salaryRange.max, j.salaryRange.currency ?? "") : "",
        url: j.hostedUrl ?? "",
        description: [
          j.descriptionPlain ?? "",
          ...(j.lists ?? []).map((l: any) => `${l.text}\n${stripHtml(l.content ?? "")}`),
          j.additionalPlain ?? "",
        ].join("\n\n"),
        postedAt: toDate(j.createdAt),
      }),
    );
  }
  const data = await fetchJson<any>(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (data.jobs ?? [])
    .filter((j: any) => j.isListed !== false)
    .map(
      (j: any): JobInput => ({
        source: `ashby:${c.slug}`,
        externalId: String(j.id),
        title: j.title ?? "",
        company,
        location: j.location ?? "",
        remote: Boolean(j.isRemote),
        salary: j.compensation?.compensationTierSummary ?? "",
        url: j.jobUrl ?? j.applyUrl ?? "",
        description: j.descriptionPlain || stripHtml(j.descriptionHtml ?? ""),
        postedAt: toDate(j.publishedAt),
      }),
    );
}
