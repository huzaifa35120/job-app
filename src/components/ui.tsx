"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  CircleCheck,
  Clock,
  Download,
  Eye,
  EyeOff,
  Globe,
  Info,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MapPin,
  PenLine,
  Receipt,
  Settings,
  Star,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { api, usd } from "@/lib/client";

const LINKS = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/usage", label: "Costs", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <Briefcase size={13} strokeWidth={2.5} />
    </span>
  );
}

/** Top bar (desktop) + tab bar (phone). Today's spend stays in view on every page. */
export function Nav() {
  const path = usePathname();
  const [budget, setBudget] = useState<{ today: number; remaining: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api("/api/usage")
        .then((d) => alive && setBudget({ today: d.summary.todayTotal, remaining: d.summary.credit.remaining }))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <BrandMark />
            Auto Job Apply
          </Link>
          <nav className="nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={isActive(path, l.href) ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="topbar-spacer" />
          {budget ? (
            <Link href="/usage" className="spend-pill" title="Spent today and credit left">
              <span>
                Today <b>{usd(budget.today, 2)}</b>
              </span>
              {budget.remaining != null ? (
                <span>
                  Left <b>{usd(budget.remaining, 2)}</b>
                </span>
              ) : null}
            </Link>
          ) : null}
          <button
            className="icon-btn"
            title="Log out"
            aria-label="Log out"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={isActive(path, l.href) ? "active" : ""}>
            <l.icon size={20} strokeWidth={2} aria-hidden />
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" | "ok" }) {
  if (!children) return null;
  const Icon = tone === "error" ? TriangleAlert : tone === "ok" ? CircleCheck : Info;
  return (
    <div className={`alert ${tone === "error" ? "" : tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon size={16} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? <Alert>{error}</Alert> : null;
}

/** Button that shows a spinner and a busy label while its async action runs. */
export function AsyncButton({
  onClick,
  children,
  busyLabel = "Working…",
  className,
  disabled,
  title,
}: {
  onClick: () => Promise<void>;
  children: React.ReactNode;
  busyLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy || disabled}
      title={title}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <>
          <LoaderCircle size={15} className="spin" aria-hidden />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** What a run did and what it cost. */
export function RunLog({ result }: { result: any }) {
  if (!result) return null;
  const lines: string[] = result.log ?? result.result?.log ?? [];
  const spent = result.spent ?? result.result?.spent;
  return (
    <div className="log" role="status">
      {lines.length ? lines.join("\n") : "Done."}
      {spent != null ? (
        <>
          {"\n"}
          <b>This run cost {usd(Number(spent), 4)}</b>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ match score

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--line-strong)";
  if (score >= 85) return "var(--eucalyptus)";
  if (score >= 70) return "var(--olive)";
  if (score >= 50) return "var(--wattle)";
  if (score > 20) return "var(--slate)";
  return "var(--pale)";
}

const VERDICT_LABEL: Record<string, string> = {
  strong: "Strong match",
  good: "Good match",
  maybe: "Partial match",
  weak: "Weak match",
  ineligible: "Can't apply",
};

export function Score({ score, verdict }: { score: number | null; verdict?: string | null }) {
  return (
    <div className="score-col" style={{ ["--score-color" as any]: scoreColor(score) }}>
      <div className={`score ${score == null ? "none" : ""}`} aria-label={score == null ? "Not matched yet" : `Match score ${score} out of 100`}>
        {score ?? "–"}
      </div>
      <div className="score-bar" aria-hidden>
        <i style={{ ["--p" as any]: (score ?? 0) / 100 }} />
      </div>
      <div className="score-word">{score == null ? "Not matched" : VERDICT_LABEL[verdict ?? ""] ?? "Match"}</div>
    </div>
  );
}

// ------------------------------------------------------------------ status

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Unsuccessful",
  hidden: "Hidden",
};

export function StatusBadge({ status, date }: { status: string; date?: string | null }) {
  if (status === "new") return null;
  return (
    <span className={`badge ${status}`}>
      {STATUS_LABEL[status] ?? status}
      {date && ["applied", "interview", "offer", "rejected"].includes(status) ? ` ${shortDay(date)}` : ""}
    </span>
  );
}

function shortDay(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ------------------------------------------------------------------ a job in a ranked list

export interface JobListItem {
  id: number;
  source: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  posted_at: string | null;
  found_at: string;
  search_label: string;
  score: number | null;
  verdict: string | null;
  score_reason: string | null;
  status: string;
  status_changed_at?: string | null;
  docs_generated_at: string | null;
  cost: number;
}

const SOURCE_NAMES: Record<string, string> = {
  adzuna: "Adzuna",
  remotive: "Remotive",
  jobicy: "Jobicy",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  websearch: "Web search",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

export function sourceName(source: string) {
  const key = source.split(":")[0];
  return SOURCE_NAMES[key] ?? key;
}

export function JobFacts({ job }: { job: Pick<JobListItem, "company" | "location" | "salary"> }) {
  return (
    <div className="facts">
      {job.company ? <span className="company">{job.company}</span> : null}
      {job.location ? (
        <span>
          <MapPin size={14} aria-hidden />
          {job.location}
        </span>
      ) : null}
      {job.salary ? (
        <span>
          <Banknote size={14} aria-hidden />
          {job.salary}
        </span>
      ) : null}
    </div>
  );
}

export function JobRow({
  job,
  feature,
  onStatus,
}: {
  job: JobListItem;
  feature?: boolean;
  onStatus?: (id: number, status: string) => void;
}) {
  const shortlisted = job.status === "shortlisted";
  const docs = Boolean(job.docs_generated_at);

  const actions = (
    <div className="job-actions">
      {onStatus ? (
        <div className="row">
          <button
            className={`icon-btn ${shortlisted ? "on" : ""}`}
            aria-pressed={shortlisted}
            title={shortlisted ? "Remove from shortlist" : "Shortlist"}
            aria-label={shortlisted ? "Remove from shortlist" : "Shortlist"}
            onClick={() => onStatus(job.id, shortlisted ? "new" : "shortlisted")}
          >
            <Star size={18} fill={shortlisted ? "#f4c430" : "none"} aria-hidden />
          </button>
          <button
            className="icon-btn"
            title={job.status === "hidden" ? "Show again" : "Hide"}
            aria-label={job.status === "hidden" ? "Show again" : "Hide"}
            onClick={() => onStatus(job.id, job.status === "hidden" ? "new" : "hidden")}
          >
            {job.status === "hidden" ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
          </button>
        </div>
      ) : null}
      <div className="row">
        {docs ? (
          <>
            <a className="btn btn-sm" href={`/api/jobs/${job.id}/pdf?doc=resume&download=1`} title="Download tailored resume (PDF)">
              <Download size={14} aria-hidden /> Resume
            </a>
            <a className="btn btn-sm" href={`/api/jobs/${job.id}/pdf?doc=cover&download=1`} title="Download cover letter (PDF)">
              <Download size={14} aria-hidden /> Letter
            </a>
          </>
        ) : (
          <Link className="btn btn-sm" href={`/jobs/${job.id}`}>
            <PenLine size={14} aria-hidden /> Tailor
          </Link>
        )}
        {job.url ? (
          <a className={`btn btn-sm ${feature || docs ? "btn-primary" : ""}`} href={job.url} target="_blank" rel="noreferrer">
            Apply <ArrowUpRight size={14} aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  );

  return (
    <article className={`job-row ${feature ? "feature" : ""} ${job.status === "hidden" ? "dim" : ""}`}>
      <Score score={job.score} verdict={job.verdict} />
      <div style={{ minWidth: 0 }}>
        <Link href={`/jobs/${job.id}`} className="job-title">
          {shortlisted ? <mark>{job.title}</mark> : job.title}
        </Link>
        <JobFacts job={job} />
        {job.score_reason ? <p className="reason">{job.score_reason}</p> : null}
        <div className="job-meta">
          <span className="row" style={{ gap: 5 }}>
            <Globe size={13} aria-hidden /> {sourceName(job.source)}
          </span>
          <span className="row" style={{ gap: 5 }}>
            <Clock size={13} aria-hidden /> {shortDay(job.posted_at ?? job.found_at)}
          </span>
          <StatusBadge status={job.status} date={job.status_changed_at} />
          {docs ? <span className="badge ready">Resume ready</span> : null}
          {job.cost > 0 ? <span>AI {usd(job.cost)}</span> : null}
        </div>
      </div>
      {actions}
    </article>
  );
}
