"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play, RotateCw, Search, X } from "lucide-react";
import { AsyncButton, ErrorBox, JobRow, RunLog, type JobListItem } from "@/components/ui";
import { ago, api } from "@/lib/client";

const STATUS_TABS = [
  { id: "active", label: "To review" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "pipeline", label: "Applied" },
  { id: "all", label: "All" },
  { id: "hidden", label: "Hidden" },
];

const SCOPES: Record<string, string> = { both: "Australia and remote", australia: "Australia", remote: "Remote" };

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [labels, setLabels] = useState<any[]>([]);
  const [searches, setSearches] = useState<any[]>([]);
  const [status, setStatus] = useState("active");
  const [minScore, setMinScore] = useState("");
  const [q, setQ] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [keywords, setKeywords] = useState("");
  const [scope, setScope] = useState("both");
  const [location, setLocation] = useState("");
  const [daily, setDaily] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (minScore) params.set("minScore", minScore);
      if (q) params.set("q", q);
      if (searchFilter) params.set("search", searchFilter);
      const [j, s] = await Promise.all([api(`/api/jobs?${params}`), api("/api/searches")]);
      setJobs(j.jobs);
      setLabels(j.labels);
      setSearches(s.searches);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, minScore, q, searchFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function runKeywordSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (keywords.trim().length < 2 || searching) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await api("/api/searches", { method: "POST", json: { keywords, scope, location, daily, runNow: true } });
      setSearchResult(res.result);
      setSearchFilter(res.search.keywords);
      setStatus("active");
    } catch (err) {
      setSearchResult({ log: [`Error: ${(err as Error).message}`] });
    } finally {
      setSearching(false);
    }
    load();
  }

  async function setJobStatus(id: number, next: string) {
    await api(`/api/jobs/${id}`, { method: "PATCH", json: { status: next } });
    load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-lede">
            Search by keyword. New results are matched to your profile, and the best ones get a tailored resume and cover letter,
            within your daily limits.
          </p>
        </div>
      </div>

      <form className="composer" onSubmit={runKeywordSearch} role="search">
        <input
          className="q"
          type="text"
          aria-label="Keywords"
          placeholder="Try “Data Analyst” or “Junior Web Developer”"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <select aria-label="Where" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="both">Australia and remote</option>
          <option value="australia">Australia only</option>
          <option value="remote">Remote only</option>
        </select>
        <input type="text" aria-label="City" placeholder="City (Sydney)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={keywords.trim().length < 2 || searching}>
          {searching ? (
            <>
              <RotateCw size={15} className="spin" aria-hidden /> Searching, 1 to 4 min
            </>
          ) : (
            <>
              <Search size={15} aria-hidden /> Search
            </>
          )}
        </button>
      </form>

      <div className="row between" style={{ marginTop: 14, alignItems: "flex-start" }}>
        <label className="check">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          Repeat this search every morning
        </label>
      </div>
      <RunLog result={searchResult} />

      {searches.length ? (
        <section aria-label="Saved searches" style={{ marginTop: 22 }}>
          <p className="label">Saved searches</p>
          <div className="chips">
            {searches.map((s) => (
              <span key={s.id} className={`chip ${s.active ? "" : "off"}`}>
                <button
                  className="chip-label"
                  onClick={() => setSearchFilter(searchFilter === s.keywords ? "" : s.keywords)}
                  title="Show only jobs from this search"
                  aria-pressed={searchFilter === s.keywords}
                >
                  {s.keywords}
                </button>
                <span className="chip-sub">
                  {SCOPES[s.scope]}
                  {s.location ? `, ${s.location}` : ""}
                  {s.last_run_at ? `, ${ago(s.last_run_at)}` : ""}
                </span>
                <AsyncButton
                  className="icon-btn"
                  busyLabel=""
                  title={s.active ? "Stop repeating every morning" : "Repeat every morning"}
                  onClick={async () => {
                    await api(`/api/searches/${s.id}`, { method: "PATCH", json: { active: !s.active } });
                    load();
                  }}
                >
                  {s.active ? <Pause size={14} aria-label="Pause daily" /> : <Play size={14} aria-label="Resume daily" />}
                </AsyncButton>
                <AsyncButton
                  className="icon-btn"
                  busyLabel=""
                  title="Run now"
                  onClick={async () => {
                    setSearchResult(null);
                    try {
                      setSearchResult((await api(`/api/searches/${s.id}/run`, { method: "POST" })).result);
                    } catch (e) {
                      setSearchResult({ log: [`Error: ${(e as Error).message}`] });
                    }
                    load();
                  }}
                >
                  <RotateCw size={14} aria-label="Run now" />
                </AsyncButton>
                <AsyncButton
                  className="icon-btn"
                  title="Delete search"
                  onClick={async () => {
                    if (confirm(`Delete the saved search "${s.keywords}"? Jobs it already found stay in your list.`)) {
                      await api(`/api/searches/${s.id}`, { method: "DELETE" });
                      load();
                    }
                  }}
                >
                  <X size={14} aria-label="Delete search" />
                </AsyncButton>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Job list" style={{ marginTop: 40 }}>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Status">
            {STATUS_TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={status === t.id} className={status === t.id ? "on" : ""} onClick={() => setStatus(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="topbar-spacer hide-sm" />
          <input type="search" placeholder="Title or company" aria-label="Filter by title or company" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} aria-label="From search">
            <option value="">From any search</option>
            {labels.map((l) => (
              <option key={l.search_label} value={l.search_label}>
                {l.search_label || "Other"} ({l.n})
              </option>
            ))}
          </select>
          <select value={minScore} onChange={(e) => setMinScore(e.target.value)} aria-label="Minimum match">
            <option value="">Any match</option>
            <option value="50">50 and up</option>
            <option value="70">70 and up</option>
            <option value="85">85 and up</option>
          </select>
        </div>
        <p className="small muted" aria-live="polite" style={{ margin: "6px 0 14px" }}>
          {loading ? "Loading…" : `${jobs.length} job${jobs.length === 1 ? "" : "s"}, best match first`}
        </p>

        <ErrorBox error={error} />

        {jobs.length ? (
          <div className="job-list">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} onStatus={setJobStatus} />
            ))}
          </div>
        ) : !loading ? (
          <div className="empty">
            <h3>No jobs here</h3>
            <p>Search above, or add target roles to your profile so they&apos;re searched every morning.</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
