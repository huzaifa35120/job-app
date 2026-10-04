"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Circle, PenLine, Play, RefreshCw } from "lucide-react";
import { AsyncButton, ErrorBox, JobRow, RunLog, type JobListItem } from "@/components/ui";
import { ago, api, usd } from "@/lib/client";

const TASKS: Record<string, { label: string; color: string }> = {
  search: { label: "Finding jobs", color: "#5a4bd1" },
  scoring: { label: "Matching", color: "#2f8f9d" },
  documents: { label: "Resumes and letters", color: "#e0a43a" },
  apply: { label: "Application answers", color: "#d0607a" },
  profile: { label: "Resume import", color: "#8a91a0" },
};

const OPERATIONS: Record<string, string> = {
  web_search: "Web search",
  score_jobs: "Matching",
  write_documents: "Resume and cover letter",
  answer_questions: "Application answers",
  import_resume: "Resume import",
};

const RUN_KINDS: Record<string, string> = {
  "daily-search": "Morning search",
  "daily-finish": "Morning matching and writing",
  "search-now": "Keyword search",
  "score-now": "Matching",
  "documents-now": "Writing documents",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function TodayPage() {
  const [data, setData] = useState<any>(null);
  const [jobs, setJobs] = useState<JobListItem[] | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [official, setOfficial] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const [d, r, j] = await Promise.all([api("/api/usage"), api("/api/runs"), api("/api/jobs?status=active&limit=8")]);
      setData(d);
      setRuns(r.runs);
      setJobs(j.jobs);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    api("/api/usage?official=1")
      .then((d) => setOfficial(d.official))
      .catch(() => {});
    // Live: refresh every 4 seconds while the tab is visible.
    const t = setInterval(() => document.visibilityState === "visible" && load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function run(action: string) {
    setRunResult(null);
    try {
      setRunResult(await api("/api/run", { method: "POST", json: { action } }));
    } catch (e) {
      setRunResult({ log: [`Error: ${(e as Error).message}`] });
    }
    load();
  }

  async function setStatus(id: number, status: string) {
    await api(`/api/jobs/${id}`, { method: "PATCH", json: { status } });
    load();
  }

  if (!data || !jobs) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">{greeting()}</h1>
        </div>
        <ErrorBox error={error} />
      </>
    );
  }

  const s = data.summary;
  const [lead, ...rest] = jobs;
  const entries = Object.entries(s.today) as [string, { spent: number; limit: number; calls: number }][];
  const totalLimit = entries.reduce((sum, [, v]) => sum + Number(v.limit), 0);
  const setupLeft = data.setup.filter((x: any) => !x.ok).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{greeting()}</h1>
          <p className="page-lede">
            {lead ? (
              <>
                <b>{s.counts.jobsFoundToday}</b> new jobs today and <b>{s.counts.jobsScoredToday}</b> matched to your profile. Your best
                match right now is <b>{lead.title}</b>
                {lead.company ? <> at {lead.company}</> : null}.
              </>
            ) : (
              "No matches yet. Once a search runs, your best jobs show up here, ranked."
            )}
          </p>
        </div>
        <Link href="/jobs" className="btn">
          All jobs
        </Link>
      </div>
      <ErrorBox error={error} />

      <div className="layout">
        <div className="stack-lg">
          <section aria-label="Best matches">
            {lead ? (
              <div className="job-list">
                <JobRow job={lead} feature onStatus={setStatus} />
                {rest.map((j) => (
                  <JobRow key={j.id} job={j} onStatus={setStatus} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <h3>Nothing to review yet</h3>
                <p>
                  {setupLeft
                    ? "Finish the setup steps on the right, then run a search."
                    : "Run a search from the panel on the right, or add a keyword search on the Jobs page."}
                </p>
              </div>
            )}
          </section>

          <div className="cols-2">
            <section aria-label="Live cost feed">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Live costs</h2>
                  <p className="section-sub">Every AI call, as it happens.</p>
                </div>
                {s.running > 0 ? <span className="badge live">{s.running} running</span> : null}
              </div>
              {data.feed.slice(0, 6).map((f: any) => (
                <div key={f.id} className="feed-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="what">
                      {OPERATIONS[f.operation] ?? f.operation}
                      {f.status === "running" ? <span className="badge live">running</span> : null}
                      {f.status === "error" ? <span className="badge fail">failed</span> : null}
                    </div>
                    <div className="detail small">{f.job_id ? <Link href={`/jobs/${f.job_id}`}>{f.detail}</Link> : f.detail}</div>
                  </div>
                  <div>
                    <div className="cost">{f.status === "running" ? "…" : usd(f.cost_usd)}</div>
                    <div className="when">{ago(f.created_at)}</div>
                  </div>
                </div>
              ))}
              {!data.feed.length ? <p className="muted small">No AI calls yet.</p> : null}
              {data.feed.length > 6 ? (
                <p className="small" style={{ marginTop: 12 }}>
                  <Link href="/usage">See every call</Link>
                </p>
              ) : null}
            </section>

            <section aria-label="Recent runs">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Recent runs</h2>
                  <p className="section-sub">Searches and writing, automatic or by hand.</p>
                </div>
              </div>
              {runs.slice(0, 6).map((r) => (
                <details key={r.id} className="feed-row" style={{ display: "block" }}>
                  <summary style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
                    <span className="strong">{RUN_KINDS[r.kind] ?? r.kind}</span>
                    <span className="muted tiny" style={{ fontWeight: 500 }}>
                      {r.status === "ok" ? "" : `${r.status}, `}
                      {r.summary?.spent != null ? `${usd(r.summary.spent)}, ` : ""}
                      {ago(r.started_at)}
                    </span>
                  </summary>
                  <pre className="desc small">{r.log || "No log."}</pre>
                </details>
              ))}
              {!runs.length ? <p className="muted small">No runs yet.</p> : null}
            </section>
          </div>
        </div>

        <aside className="rail">
          <section className="panel" aria-label="Spending">
            <div className="panel-title">
              <span>Spent today</span>
              <Link href="/usage">Costs</Link>
            </div>
            <div className="figure">{usd(s.todayTotal, 2)}</div>
            <p className="small muted" style={{ marginTop: 4 }}>
              of {usd(totalLimit, 2)} across your daily limits
            </p>
            <div className="spend-bar" aria-hidden>
              {entries.map(([cat, v]) =>
                v.spent > 0 && totalLimit > 0 ? (
                  <i key={cat} style={{ width: `${Math.min(100, (v.spent / totalLimit) * 100)}%`, background: TASKS[cat]?.color }} />
                ) : null,
              )}
            </div>
            {entries.map(([cat, v]) => (
              <div key={cat} className={`spend-row ${v.limit > 0 && v.spent >= v.limit ? "over" : ""}`}>
                <span className="dot" style={{ background: TASKS[cat]?.color }} aria-hidden />
                <span>{TASKS[cat]?.label ?? cat}</span>
                <span className="amt">
                  <b>{usd(v.spent, 3)}</b> <span className="muted">of {usd(v.limit, 2)}</span>
                </span>
              </div>
            ))}
            <hr className="hr" />
            <div className="row between">
              <span className="small muted">Credit left</span>
              {s.credit.remaining == null ? (
                <Link href="/settings" className="small">
                  Add your balance
                </Link>
              ) : (
                <span className="figure sm">{usd(s.credit.remaining, 2)}</span>
              )}
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>
              This month {usd(s.monthTotal, 2)}. Limits reset at midnight, {s.timezone.replace("_", " ")} time.
            </p>
            {official?.available ? (
              <p className="tiny muted" style={{ marginTop: 6 }}>
                Anthropic&apos;s own figures:{" "}
                {official.error ? <span className="bad">{official.error}</span> : `today ${usd(official.todayUsd, 2)}, this month ${usd(official.monthUsd, 2)} (UTC)`}
              </p>
            ) : null}
          </section>

          {setupLeft ? (
            <section className="panel" aria-label="Setup">
              <div className="panel-title">
                <span>Finish setting up</span>
                <span className="muted tiny">
                  {data.setup.length - setupLeft} of {data.setup.length} done
                </span>
              </div>
              <ul className="checklist">
                {data.setup.map((x: any) => (
                  <li key={x.text} className={x.ok ? "done" : ""}>
                    {x.ok ? <Check size={16} className="good" aria-hidden /> : <Circle size={16} className="muted" aria-hidden />}
                    {x.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel" aria-label="Run now">
            <div className="panel-title">
              <span>Run now</span>
            </div>
            <p className="small muted" style={{ marginBottom: 14 }}>
              These also run on their own every morning: the search around 6 to 7am, then matching and writing an hour later.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              <AsyncButton className="btn-primary btn-block" onClick={() => run("search")} busyLabel="Searching, up to 4 min">
                <Play size={15} aria-hidden /> Search all saved searches
              </AsyncButton>
              <AsyncButton className="btn-block" onClick={() => run("score")} busyLabel="Matching…">
                <RefreshCw size={15} aria-hidden /> Match {s.counts.unscored} waiting job{s.counts.unscored === 1 ? "" : "s"}
              </AsyncButton>
              <AsyncButton className="btn-block" onClick={() => run("documents")} busyLabel="Writing…">
                <PenLine size={15} aria-hidden /> Write for top matches
              </AsyncButton>
            </div>
            <RunLog result={runResult} />
          </section>
        </aside>
      </div>
    </>
  );
}
