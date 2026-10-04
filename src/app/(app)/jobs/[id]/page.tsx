"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Clock, Copy, Download, ExternalLink, Globe, PenLine } from "lucide-react";
import { Alert, AsyncButton, ErrorBox, JobFacts, Score, StatusBadge, sourceName } from "@/components/ui";
import { api, shortDate, usd } from "@/lib/client";

const STATUSES = [
  { id: "new", label: "New" },
  { id: "shortlisted", label: "Shortlisted" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Unsuccessful" },
  { id: "hidden", label: "Hidden" },
];

function resumeToText(r: any): string {
  const out: string[] = [];
  if (r.headline) out.push(r.headline, "");
  if (r.summary) out.push("SUMMARY", r.summary, "");
  if (r.skills?.length) out.push("SKILLS", ...r.skills.map((g: any) => `${g.category}: ${g.items.join(", ")}`), "");
  if (r.experience?.length) {
    out.push("EXPERIENCE");
    for (const e of r.experience) out.push(`${e.title}, ${e.company} (${e.start} – ${e.end})`, ...e.bullets.map((b: string) => `• ${b}`), "");
  }
  if (r.projects?.length) {
    out.push("PROJECTS");
    for (const p of r.projects) out.push(`${p.name}${p.tech ? ` | ${p.tech}` : ""}`, ...p.bullets.map((b: string) => `• ${b}`), "");
  }
  if (r.education?.length) {
    out.push("EDUCATION");
    for (const e of r.education) out.push(`${e.degree}, ${e.institution} (${e.start} – ${e.end})`, ...e.details.map((d: string) => `• ${d}`), "");
  }
  if (r.certifications?.length) out.push("CERTIFICATIONS", ...r.certifications.map((c: string) => `• ${c}`), "");
  if (r.extras?.length) out.push("ADDITIONAL", ...r.extras.map((c: string) => `• ${c}`));
  return out.join("\n").trim();
}

function letterToText(l: any): string {
  return [l.greeting, "", ...l.paragraphs.flatMap((p: string) => [p, ""]), l.sign_off].join("\n");
}

function ResumeSheet({ r }: { r: any }) {
  return (
    <div className="sheet">
      {r.headline ? <div className="sheet-head">{r.headline}</div> : null}
      {r.summary ? (
        <>
          <h4>Summary</h4>
          <p>{r.summary}</p>
        </>
      ) : null}
      {r.skills?.length ? (
        <>
          <h4>Skills</h4>
          {r.skills.map((g: any, i: number) => (
            <div key={i}>
              <b>{g.category}:</b> {g.items.join(", ")}
            </div>
          ))}
        </>
      ) : null}
      {r.experience?.length ? (
        <>
          <h4>Experience</h4>
          {r.experience.map((e: any, i: number) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div className="sheet-row">
                <b>
                  {e.title}, {e.company}
                </b>
                <span className="when">
                  {e.start} – {e.end}
                </span>
              </div>
              <ul>
                {e.bullets.map((b: string, k: number) => (
                  <li key={k}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}
      {r.projects?.length ? (
        <>
          <h4>Projects</h4>
          {r.projects.map((p: any, i: number) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <b>{p.name}</b> {p.tech ? <span className="muted">| {p.tech}</span> : null}
              <ul>
                {p.bullets.map((b: string, k: number) => (
                  <li key={k}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : null}
      {r.education?.length ? (
        <>
          <h4>Education</h4>
          {r.education.map((e: any, i: number) => (
            <div key={i}>
              <div className="sheet-row">
                <span>
                  <b>{e.degree}</b>, {e.institution}
                </span>
                <span className="when">
                  {e.start} – {e.end}
                </span>
              </div>
              {e.details.length ? (
                <ul>
                  {e.details.map((d: string, k: number) => (
                    <li key={k}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [doc, setDoc] = useState<"resume" | "letter">("resume");
  const [pasted, setPasted] = useState("");
  const [questions, setQuestions] = useState("");
  const [letterText, setLetterText] = useState("");
  const [resumeJson, setResumeJson] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/jobs/${id}`);
      setData(d);
      setNotes(d.job.notes ?? "");
      setLetterText(d.job.cover_letter ? letterToText(d.job.cover_letter) : "");
      setResumeJson(d.job.resume ? JSON.stringify(d.job.resume, null, 2) : "");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<any>, success?: string) {
    setError(null);
    setMessage(null);
    try {
      const res = await fn();
      if (success) setMessage(typeof res?.cost === "number" ? `${success}. AI cost ${usd(res.cost)}.` : success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Copied to clipboard.");
  }

  const back = (
    <p style={{ marginBottom: 20 }}>
      <Link href="/jobs" className="btn btn-quiet btn-sm" style={{ marginLeft: -11 }}>
        <ArrowLeft size={15} aria-hidden /> Jobs
      </Link>
    </p>
  );

  if (!data) {
    return (
      <>
        {back}
        <ErrorBox error={error} />
      </>
    );
  }

  const job = data.job;
  const description: string = job.full_description || job.description;
  const hasResume = Boolean(job.resume);
  const hasLetter = Boolean(job.cover_letter);
  const hasDocs = hasResume || hasLetter;
  const applied = ["applied", "interview", "offer", "rejected"].includes(job.status);
  // Your profile changed after this document was written, so it may be missing your updates.
  const profileAt = data.profileUpdatedAt ? Date.parse(data.profileUpdatedAt) : 0;
  const resumeAt = Date.parse(job.resume_at ?? job.docs_generated_at ?? "") || 0;
  const letterAt = Date.parse(job.cover_at ?? job.docs_generated_at ?? "") || 0;
  const resumeStale = hasResume && profileAt > resumeAt + 1000;
  const letterStale = hasLetter && profileAt > letterAt + 1000;

  async function write(which: "both" | "resume" | "cover") {
    const what = which === "both" ? "resume and cover letter" : which === "resume" ? "resume" : "cover letter";
    const exists = which === "both" ? hasDocs : which === "resume" ? hasResume : hasLetter;
    if (exists && !confirm(`Write a new ${what} from your current profile? It replaces the current one, including any edits you made to it.`)) return;
    const done = `${what.charAt(0).toUpperCase()}${what.slice(1)} ${exists ? "rewritten" : "written"}`;
    await act(() => api(`/api/jobs/${id}/generate`, { method: "POST", json: { which } }), done);
  }

  const staleNotice = (what: string) => (
    <Alert tone="info">
      You&apos;ve updated your profile since this {what} was written. Rewrite it to include your changes.
    </Alert>
  );

  return (
    <>
      {back}

      <header className="job-row feature static" style={{ borderBottom: 0, padding: "0 0 8px" }}>
        <Score score={job.score} verdict={job.verdict} />
        <div style={{ minWidth: 0 }}>
          <h1 className="job-title" style={{ display: "block" }}>
            {job.status === "shortlisted" ? <mark>{job.title}</mark> : job.title}
          </h1>
          <JobFacts job={job} />
          {job.score_reason ? <p className="reason">{job.score_reason}</p> : null}
          <div className="job-meta">
            <span className="row" style={{ gap: 5 }}>
              <Globe size={13} aria-hidden /> {sourceName(job.source)}
            </span>
            <span className="row" style={{ gap: 5 }}>
              <Clock size={13} aria-hidden /> Posted {shortDate(job.posted_at ?? job.found_at)}
            </span>
            <StatusBadge status={job.status} date={job.status_changed_at} />
          </div>
        </div>
      </header>

      <ErrorBox error={error} />
      {message ? <Alert tone="ok">{message}</Alert> : null}

      <div className="layout detail" style={{ marginTop: 28 }}>
        <div className="stack-lg">
          {job.score_details ? (
            <section aria-label="Why it matches" className="cols-2" style={{ gap: 24 }}>
              <div className="box">
                <h2 className="strong" style={{ fontSize: 15, marginBottom: 10 }}>
                  What you bring
                </h2>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {(job.score_details.matched ?? []).map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
              <div className="box">
                <h2 className="strong" style={{ fontSize: 15, marginBottom: 10 }}>
                  Gaps to address
                </h2>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {(job.score_details.gaps ?? []).map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section aria-label="Resume and cover letter">
            <div className="section-head">
              <div>
                <h2 className="section-title">Resume and cover letter</h2>
                <p className="section-sub">Written only from your profile. Both together cost about $0.05 to $0.20; one on its own costs less.</p>
              </div>
              <AsyncButton className={hasDocs ? "" : "btn-primary"} onClick={() => write("both")} busyLabel="Writing, 30 to 90 seconds">
                <PenLine size={15} aria-hidden /> {hasDocs ? "Rewrite both" : "Write both"}
              </AsyncButton>
            </div>
            {description.length < 800 ? (
              <Alert tone="info">
                Only a short description is saved for this job ({description.length} characters). Fetch or paste the full ad below
                first and the documents will be more specific.
              </Alert>
            ) : null}

            {hasDocs ? (
              <>
                {job.doc_notes?.review_flags?.length ? (
                  <Alert tone="info">
                    <b>
                      Check before sending
                      {job.doc_notes.scope === "resume" ? " (resume)" : job.doc_notes.scope === "cover" ? " (cover letter)" : ""}:
                    </b>{" "}
                    {job.doc_notes.review_flags.join(" ")}
                  </Alert>
                ) : null}
                {job.doc_notes?.emphasized?.length ? (
                  <p className="small muted" style={{ margin: "4px 0 18px" }}>
                    Emphasised: {job.doc_notes.emphasized.join("; ")}
                  </p>
                ) : null}

                <div className="doc-tabs" role="tablist">
                  <button role="tab" aria-selected={doc === "resume"} className={doc === "resume" ? "on" : ""} onClick={() => setDoc("resume")}>
                    Resume
                  </button>
                  <button role="tab" aria-selected={doc === "letter"} className={doc === "letter" ? "on" : ""} onClick={() => setDoc("letter")}>
                    Cover letter
                  </button>
                </div>

                {doc === "resume" ? (
                  hasResume ? (
                    <>
                      {resumeStale ? staleNotice("resume") : null}
                      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
                        <a className="btn btn-sm" href={`/api/jobs/${id}/pdf?doc=resume&download=1`}>
                          <Download size={14} aria-hidden /> Download PDF
                        </a>
                        <a className="btn btn-sm" href={`/api/jobs/${id}/pdf?doc=resume`} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} aria-hidden /> Open PDF
                        </a>
                        <button className="btn-sm" onClick={() => copy(resumeToText(job.resume))}>
                          <Copy size={14} aria-hidden /> Copy text
                        </button>
                        <AsyncButton className={`btn-sm ${resumeStale ? "btn-primary" : ""}`} onClick={() => write("resume")} busyLabel="Rewriting, 30 to 60 seconds">
                          <PenLine size={14} aria-hidden /> Rewrite resume
                        </AsyncButton>
                      </div>
                      <ResumeSheet r={job.resume} />
                      <details style={{ marginTop: 16 }}>
                        <summary>
                          <ChevronRight size={15} aria-hidden /> Edit the resume data
                        </summary>
                        <textarea value={resumeJson} onChange={(e) => setResumeJson(e.target.value)} style={{ minHeight: 300, fontSize: 13 }} spellCheck={false} />
                        <div className="row" style={{ marginTop: 8 }}>
                          <AsyncButton
                            className="btn-sm"
                            onClick={() =>
                              act(async () => {
                                const parsed = JSON.parse(resumeJson);
                                return api(`/api/jobs/${id}`, { method: "PATCH", json: { resume: parsed } });
                              }, "Resume saved")
                            }
                          >
                            Save resume
                          </AsyncButton>
                        </div>
                      </details>
                    </>
                  ) : (
                    <div className="empty" style={{ padding: "32px 20px" }}>
                      <p style={{ marginBottom: 14 }}>No tailored resume for this job yet.</p>
                      <AsyncButton className="btn-primary" onClick={() => write("resume")} busyLabel="Writing, 30 to 60 seconds">
                        <PenLine size={15} aria-hidden /> Write resume
                      </AsyncButton>
                    </div>
                  )
                ) : hasLetter ? (
                  <>
                    {letterStale ? staleNotice("cover letter") : null}
                    <div className="row" style={{ marginBottom: 14, gap: 8 }}>
                      <a className="btn btn-sm" href={`/api/jobs/${id}/pdf?doc=cover&download=1`}>
                        <Download size={14} aria-hidden /> Download PDF
                      </a>
                      <a className="btn btn-sm" href={`/api/jobs/${id}/pdf?doc=cover`} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} aria-hidden /> Open PDF
                      </a>
                      <button className="btn-sm" onClick={() => copy(letterText)}>
                        <Copy size={14} aria-hidden /> Copy text
                      </button>
                      <AsyncButton className={`btn-sm ${letterStale ? "btn-primary" : ""}`} onClick={() => write("cover")} busyLabel="Rewriting, 20 to 40 seconds">
                        <PenLine size={14} aria-hidden /> Rewrite cover letter
                      </AsyncButton>
                    </div>
                    <textarea aria-label="Cover letter" value={letterText} onChange={(e) => setLetterText(e.target.value)} style={{ minHeight: 380, fontSize: 15 }} />
                    <div className="row between" style={{ marginTop: 10 }}>
                      <p className="hint" style={{ margin: 0 }}>
                        Keep the greeting first and the sign-off last, with blank lines between paragraphs.
                      </p>
                      <AsyncButton
                        className="btn-sm"
                        onClick={() =>
                          act(() => {
                            const blocks = letterText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
                            const letter = {
                              greeting: blocks[0] ?? "",
                              paragraphs: blocks.slice(1, -1),
                              sign_off: blocks.length > 1 ? blocks[blocks.length - 1] : "",
                            };
                            return api(`/api/jobs/${id}`, { method: "PATCH", json: { cover_letter: letter } });
                          }, "Cover letter saved")
                        }
                      >
                        Save letter
                      </AsyncButton>
                    </div>
                  </>
                ) : (
                  <div className="empty" style={{ padding: "32px 20px" }}>
                    <p style={{ marginBottom: 14 }}>No cover letter for this job yet.</p>
                    <AsyncButton className="btn-primary" onClick={() => write("cover")} busyLabel="Writing, 20 to 40 seconds">
                      <PenLine size={15} aria-hidden /> Write cover letter
                    </AsyncButton>
                  </div>
                )}
              </>
            ) : null}
          </section>

          <section aria-label="Application questions">
            <div className="section-head">
              <div>
                <h2 className="section-title">Application questions</h2>
                <p className="section-sub">Paste the form&apos;s questions. Anything your profile can&apos;t answer is marked [FILL IN].</p>
              </div>
            </div>
            <textarea
              aria-label="Application questions"
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={"Why do you want to work here? (150 words)\nTell us about a project you're proud of."}
            />
            <div className="row end" style={{ marginTop: 10 }}>
              <AsyncButton
                onClick={() => act(() => api(`/api/jobs/${id}/answers`, { method: "POST", json: { questions } }), "Answers drafted")}
                disabled={!questions.trim()}
                busyLabel="Drafting…"
              >
                <PenLine size={15} aria-hidden /> Draft answers
              </AsyncButton>
            </div>
            {(job.answers ?? []).length ? (
              <div style={{ marginTop: 16 }}>
                {job.answers.map((a: any, i: number) => (
                  <div key={i} className="qa">
                    <p className="strong small">{a.question}</p>
                    <p style={{ whiteSpace: "pre-wrap", marginTop: 6, color: "var(--ink-2)" }}>{a.answer}</p>
                    <div className="row between" style={{ marginTop: 8 }}>
                      {a.needs_input ? <span className="badge live">Needs your input</span> : <span />}
                      <button className="btn-sm btn-quiet" onClick={() => copy(a.answer)}>
                        <Copy size={14} aria-hidden /> Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section aria-label="Job description">
            <div className="section-head">
              <div>
                <h2 className="section-title">The ad</h2>
                <p className="section-sub">{job.full_description ? "Full text from the posting." : "The short version from the job feed."}</p>
              </div>
              <AsyncButton
                className="btn-sm"
                onClick={() => act(() => api(`/api/jobs/${id}/fetch-description`, { method: "POST" }), "Full description fetched")}
                busyLabel="Fetching…"
              >
                Fetch full text, free
              </AsyncButton>
            </div>
            <pre className="desc">{description || "No description saved."}</pre>
            <details style={{ marginTop: 16 }}>
              <summary>
                <ChevronRight size={15} aria-hidden /> Paste the full ad yourself
              </summary>
              <textarea aria-label="Full description" value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ minHeight: 160 }} />
              <div className="row" style={{ marginTop: 8 }}>
                <AsyncButton
                  className="btn-sm"
                  disabled={pasted.trim().length < 50}
                  onClick={() => act(() => api(`/api/jobs/${id}`, { method: "PATCH", json: { full_description: pasted } }), "Description saved")}
                >
                  Save description
                </AsyncButton>
              </div>
            </details>
          </section>
        </div>

        <aside className="rail">
          <section className="panel" aria-label="Apply">
            {job.url ? (
              <a className="btn btn-primary btn-block" href={`/api/jobs/${id}/open`} target="_blank" rel="noreferrer" style={{ height: 44 }}>
                Apply on the job site <ArrowUpRight size={16} aria-hidden />
              </a>
            ) : (
              <p className="small muted">No link saved for this job.</p>
            )}
            <div className="segmented block" role="group" aria-label="Have you applied?" style={{ marginTop: 10 }}>
              <button
                className={applied ? "on applied" : ""}
                aria-pressed={applied}
                disabled={applied}
                onClick={() => act(() => api(`/api/jobs/${id}`, { method: "PATCH", json: { status: "applied" } }), "Marked as applied")}
              >
                <Check size={15} aria-hidden /> Applied
              </button>
              <button
                className={applied ? "" : "on"}
                aria-pressed={!applied}
                disabled={!applied}
                onClick={() => act(() => api(`/api/jobs/${id}`, { method: "PATCH", json: { status: "new" } }), "Moved back to To review")}
              >
                Not applied yet
              </button>
            </div>
            {applied && job.status_changed_at ? (
              <p className="hint" style={{ textAlign: "center" }}>
                {job.status === "applied" ? "Applied" : `Status: ${STATUSES.find((x) => x.id === job.status)?.label ?? job.status}`} since{" "}
                {shortDate(job.status_changed_at)}
              </p>
            ) : null}
            {hasDocs ? (
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "nowrap" }}>
                {hasResume ? (
                  <a className="btn btn-sm" style={{ flex: 1 }} href={`/api/jobs/${id}/pdf?doc=resume&download=1`}>
                    <Download size={14} aria-hidden /> Resume
                  </a>
                ) : null}
                {hasLetter ? (
                  <a className="btn btn-sm" style={{ flex: 1 }} href={`/api/jobs/${id}/pdf?doc=cover&download=1`}>
                    <Download size={14} aria-hidden /> Letter
                  </a>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel" aria-label="Status">
            <div className="panel-title">
              <span>Status</span>
            </div>
            <div className="status-list">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  className={job.status === s.id ? "on" : ""}
                  aria-pressed={job.status === s.id}
                  onClick={() => act(() => api(`/api/jobs/${id}`, { method: "PATCH", json: { status: s.id } }))}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel" aria-label="Notes">
            <div className="panel-title">
              <span>Notes</span>
            </div>
            <textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contacts, interview times, follow-ups" />
            <div className="row end" style={{ marginTop: 8 }}>
              <AsyncButton className="btn-sm" onClick={() => act(() => api(`/api/jobs/${id}`, { method: "PATCH", json: { notes } }), "Notes saved")}>
                Save notes
              </AsyncButton>
            </div>
          </section>

          <section className="panel" aria-label="AI cost for this job">
            <div className="panel-title">
              <span>AI cost for this job</span>
              <span className="figure sm">{usd(data.cost)}</span>
            </div>
            {data.scoringCost ? (
              <div className="spend-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span>Matching</span>
                <span className="amt">{usd(data.scoringCost)}</span>
              </div>
            ) : null}
            {data.usage.map((u: any) => (
              <div key={u.id} className="spend-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span>
                  {u.detail.split(":")[0]} {u.status === "error" ? <span className="badge fail">failed</span> : null}
                </span>
                <span className="amt">{usd(Number(u.cost_usd))}</span>
              </div>
            ))}
            {!data.usage.length && !data.scoringCost ? <p className="small muted">Nothing spent on this job yet.</p> : null}
          </section>
        </aside>
      </div>
    </>
  );
}
