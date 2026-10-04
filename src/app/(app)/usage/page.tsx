"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api, usd } from "@/lib/client";

const CATS = ["search", "scoring", "documents", "apply", "profile"];
const CAT_LABELS: Record<string, string> = {
  search: "Web search",
  scoring: "Matching",
  documents: "Resumes",
  apply: "Answers",
  profile: "Import",
};
const OPERATIONS: Record<string, string> = {
  web_search: "Web search",
  score_jobs: "Matching",
  write_documents: "Resume and cover letter",
  answer_questions: "Application answers",
  import_resume: "Resume import",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function UsagePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/api/usage/history?limit=300")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (!data) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Costs</h1>
        </div>
        <ErrorBox error={error} />
      </>
    );
  }

  const days: string[] = [...new Set<string>(data.daily.map((d: any) => d.day))];
  const cell = (day: string, cat: string) => data.daily.find((d: any) => d.day === day && d.category === cat);
  const total31 = data.daily.reduce((s: number, d: any) => s + d.cost, 0);
  const allTime = data.byModel.reduce((s: number, m: any) => s + m.cost, 0);
  const calls = data.byModel.reduce((s: number, m: any) => s + m.calls, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Costs</h1>
          <p className="page-lede">
            <b>{usd(total31, 2)}</b> in the last 31 days and <b>{usd(allTime, 2)}</b> since you started, across{" "}
            <b>{calls.toLocaleString()}</b> AI calls. Worked out from the exact token counts on every call, at list prices. Your
            Claude Console bill is the final word.
          </p>
        </div>
      </div>

      <div className="stack-lg">
        <section aria-label="By day">
          <div className="section-head">
            <h2 className="section-title">By day</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  {CATS.map((c) => (
                    <th key={c} className="num">
                      {CAT_LABELS[c]}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const total = CATS.reduce((s, c) => s + (cell(day, c)?.cost ?? 0), 0);
                  return (
                    <tr key={day}>
                      <td className="nowrap">{new Date(`${day}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</td>
                      {CATS.map((c) => {
                        const x = cell(day, c);
                        return (
                          <td key={c} className="num">
                            {x ? usd(x.cost) : <span className="muted">–</span>}
                          </td>
                        );
                      })}
                      <td className="num strong">{usd(total)}</td>
                    </tr>
                  );
                })}
                {!days.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Nothing spent yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="cols-2">
          <section aria-label="By model">
            <div className="section-head">
              <h2 className="section-title">By model</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">Calls</th>
                    <th className="num">Tokens in</th>
                    <th className="num">Tokens out</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((m: any) => (
                    <tr key={m.model}>
                      <td className="nowrap">{m.model.replace("claude-", "")}</td>
                      <td className="num">{m.calls}</td>
                      <td className="num">{(m.input_tokens + m.cache_read_tokens).toLocaleString()}</td>
                      <td className="num">{m.output_tokens.toLocaleString()}</td>
                      <td className="num strong">{usd(m.cost)}</td>
                    </tr>
                  ))}
                  {!data.byModel.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No calls yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-label="By task">
            <div className="section-head">
              <h2 className="section-title">By task</h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th className="num">Calls</th>
                    <th className="num">Average</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byOperation.map((o: any) => (
                    <tr key={`${o.category}-${o.operation}`}>
                      <td>{OPERATIONS[o.operation] ?? o.operation}</td>
                      <td className="num">{o.calls}</td>
                      <td className="num">{usd(o.avg_cost)}</td>
                      <td className="num strong">{usd(o.cost)}</td>
                    </tr>
                  ))}
                  {!data.byOperation.length ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No calls yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section aria-label="Every AI call">
          <div className="section-head">
            <div>
              <h2 className="section-title">Every AI call</h2>
              <p className="section-sub">The latest 300, newest first.</p>
            </div>
          </div>

          <div className="show-sm">
            {data.ledger.map((l: any) => (
              <div key={l.id} className="feed-row">
                <div style={{ minWidth: 0 }}>
                  <div className="what">
                    {OPERATIONS[l.operation] ?? l.operation}
                    {l.status === "error" ? <span className="badge fail">failed</span> : null}
                    {l.status === "running" ? <span className="badge live">running</span> : null}
                  </div>
                  <div className="detail small">{l.job_id ? <Link href={`/jobs/${l.job_id}`}>{l.detail}</Link> : l.detail}</div>
                  <div className="tiny muted">
                    {l.model.replace("claude-", "")}, {(l.input_tokens + l.cache_read_tokens + l.cache_write_tokens).toLocaleString()} tokens in,{" "}
                    {l.output_tokens.toLocaleString()} out
                  </div>
                </div>
                <div>
                  <div className="cost">{usd(l.cost_usd)}</div>
                  <div className="when">{when(l.created_at)}</div>
                </div>
              </div>
            ))}
            {!data.ledger.length ? <p className="muted small">No calls yet.</p> : null}
          </div>

          <div className="table-wrap hide-sm">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Model</th>
                  <th className="num">In</th>
                  <th className="num">Cached</th>
                  <th className="num">Out</th>
                  <th className="num">Searches</th>
                  <th className="num">Time</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.ledger.map((l: any) => (
                  <tr key={l.id}>
                    <td className="nowrap small">{when(l.created_at)}</td>
                    <td className="small" style={{ minWidth: 240 }}>
                      {l.job_id ? <Link href={`/jobs/${l.job_id}`}>{l.detail}</Link> : l.detail}{" "}
                      {l.status === "error" ? <span className="badge fail">failed</span> : null}
                      {l.status === "running" ? <span className="badge live">running</span> : null}
                    </td>
                    <td className="nowrap small">{l.model.replace("claude-", "")}</td>
                    <td className="num small">{l.input_tokens.toLocaleString()}</td>
                    <td className="num small">{(l.cache_read_tokens + l.cache_write_tokens).toLocaleString()}</td>
                    <td className="num small">{l.output_tokens.toLocaleString()}</td>
                    <td className="num small">{l.web_searches || ""}</td>
                    <td className="num small">{l.duration_ms ? `${(l.duration_ms / 1000).toFixed(1)}s` : ""}</td>
                    <td className="num strong">{usd(l.cost_usd)}</td>
                  </tr>
                ))}
                {!data.ledger.length ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      No calls yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
