"use client";

import { useEffect, useId, useState } from "react";
import { Check, Circle, Plus, Trash2 } from "lucide-react";
import { Alert, AsyncButton, ErrorBox } from "@/components/ui";
import { api } from "@/lib/client";
import type { Settings } from "@/lib/settings";

const SOURCES: { id: keyof Settings["sources"]; label: string; note: string }[] = [
  { id: "adzuna", label: "Adzuna", note: "Australian jobs. Needs a free key (ADZUNA_APP_ID and ADZUNA_APP_KEY)." },
  { id: "remotive", label: "Remotive", note: "Remote jobs, free." },
  { id: "jobicy", label: "Jobicy", note: "Remote jobs, free." },
  { id: "himalayas", label: "Himalayas", note: "Remote jobs open to people in Australia, free." },
  { id: "remoteok", label: "Remote OK", note: "Remote jobs, free." },
  { id: "companies", label: "Company job boards", note: "The companies you add below, free." },
  { id: "webSearch", label: "AI web search", note: "Seek, LinkedIn, Indeed and more. About $0.01 a search plus tokens, from your finding-jobs limit." },
];

const list = (a: string[]) => a.join(", ");
const unlist = (s: string) => s.split(",");

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: any; onChange: (v: any) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextField({ label, value, onChange, hint, wide, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: string; wide?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <div className={wide ? "span-all" : undefined}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <div>
        <h2>{title}</h2>
        {desc ? <p className="section-sub">{desc}</p> : null}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </section>
  );
}

const SCOPE_OPTIONS = [
  { value: "both", label: "Australia and remote" },
  { value: "australia", label: "Australia only" },
  { value: "remote", label: "Remote only" },
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [balance, setBalance] = useState("");
  const [newCompany, setNewCompany] = useState({ ats: "greenhouse", slug: "" });
  const balanceId = useId();
  const slugId = useId();

  useEffect(() => {
    api("/api/settings")
      .then((d) => {
        setS(d.settings);
        setMeta(d.meta);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (!s || !meta) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Settings</h1>
        </div>
        <ErrorBox error={error} />
      </>
    );
  }
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  async function save(next: Settings = s!) {
    setError(null);
    setMessage(null);
    try {
      const d = await api("/api/settings", { method: "PUT", json: { settings: next } });
      setS(d.settings);
      setMeta(d.meta);
      setMessage("Settings saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const connections = [
    { ok: meta.env.anthropic, text: "Anthropic API key", optional: false },
    { ok: meta.env.cron, text: "CRON_SECRET, for the automatic morning runs", optional: false },
    { ok: meta.env.adzuna, text: "Adzuna keys, for Australian jobs", optional: true },
    { ok: meta.env.adminKey, text: "Anthropic Admin key, organisation accounts only", optional: true },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-lede">Daily spending limits, which AI model does each job, where jobs come from, and what runs on its own.</p>
        </div>
      </div>

      <ErrorBox error={error} />
      {message ? <Alert tone="ok">{message}</Alert> : null}

      <Section
        title="Daily limits and models"
        desc="Each task stops for the day when it reaches its limit, checked before every AI call. Set a limit to 0 to turn a task off."
      >
        <div>
          <div className="limit-row head" aria-hidden>
            <span>Task</span>
            <span>Limit a day, USD</span>
            <span className="model">Model</span>
          </div>
          {meta.categories.map((c: any) => (
            <div key={c.id} className="limit-row">
              <span className="task">{c.label}</span>
              <input
                type="number"
                min={0}
                step={0.1}
                aria-label={`${c.label} daily limit in US dollars`}
                value={(s.limits as any)[c.id]}
                onChange={(e) => set({ limits: { ...s.limits, [c.id]: e.target.value as any } })}
              />
              <select
                className="model"
                aria-label={`${c.label} model`}
                value={(s.models as any)[c.id]}
                onChange={(e) => set({ models: { ...s.models, [c.id]: e.target.value } })}
              >
                {meta.models.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="fields" style={{ marginTop: 18 }}>
          <TextField label="Timezone for the daily reset" value={s.timezone} onChange={(v) => set({ timezone: v })} />
        </div>
      </Section>

      <Section title="Credit balance" desc="Anthropic doesn't share your balance with apps, so type in what the Claude Console shows after each top-up.">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ width: 200 }}>
            <label htmlFor={balanceId}>Balance right now, USD</label>
            <input
              id={balanceId}
              type="number"
              min={0}
              step={0.01}
              value={balance}
              placeholder={s.credit.balance?.toString() ?? "19.96"}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
          <AsyncButton
            className="btn-primary"
            disabled={balance === ""}
            onClick={async () => {
              const next = { ...s, credit: { balance: Number(balance), asOf: new Date().toISOString() } };
              setS(next);
              await save(next);
              setBalance("");
            }}
          >
            Update balance
          </AsyncButton>
        </div>
        {s.credit.asOf ? (
          <p className="hint">
            Last set to ${s.credit.balance} on {new Date(s.credit.asOf).toLocaleString("en-AU")}. Spending since then is subtracted
            automatically.
          </p>
        ) : null}
      </Section>

      <Section title="Where jobs come from">
        <div className="sources">
          {SOURCES.map((src) => (
            <label key={src.id} className="check">
              <input type="checkbox" checked={s.sources[src.id]} onChange={(e) => set({ sources: { ...s.sources, [src.id]: e.target.checked } })} />
              <span>
                <span className="strong">{src.label}</span>
                <span className="hint" style={{ display: "block", marginTop: 0 }}>
                  {src.note}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="fields" style={{ marginTop: 22 }}>
          <SelectField
            label="Use AI web search for"
            value={s.webSearchScope}
            onChange={(v) => set({ webSearchScope: v as any })}
            options={[
              { value: "australia", label: "Australian searches" },
              { value: "remote", label: "Remote searches" },
              { value: "both", label: "Both" },
            ]}
          />
          <NumberField label="Web searches per keyword" min={1} max={10} value={s.webSearchMaxSearches} onChange={(v) => set({ webSearchMaxSearches: v })} />
          <TextField label="Australian cities" hint="Separated by commas. Leave empty for all of Australia." value={list(s.australiaLocations)} onChange={(v) => set({ australiaLocations: unlist(v) })} />
          <NumberField label="Skip jobs older than, in days" min={1} max={60} value={s.maxAgeDays} onChange={(v) => set({ maxAgeDays: v })} />
        </div>
      </Section>

      <Section title="Automatic runs" desc="What happens every morning without you.">
        <div className="stack" style={{ gap: 16 }}>
          <label className="check">
            <input type="checkbox" checked={s.recommended.enabled} onChange={(e) => set({ recommended: { ...s.recommended, enabled: e.target.checked } })} />
            Search my profile&apos;s target roles every morning
          </label>
          <div className="fields">
            <SelectField label="Search target roles in" value={s.recommended.scope} onChange={(v) => set({ recommended: { ...s.recommended, scope: v as any } })} options={SCOPE_OPTIONS} />
            <NumberField label="Most jobs to match in one run" min={1} max={300} value={s.maxScorePerRun} onChange={(v) => set({ maxScorePerRun: v })} />
          </div>
          <label className="check">
            <input type="checkbox" checked={s.autoGenerate.enabled} onChange={(e) => set({ autoGenerate: { ...s.autoGenerate, enabled: e.target.checked } })} />
            Write a resume and cover letter for my best matches automatically
          </label>
          <div className="fields">
            <NumberField label="Only for scores of at least" min={0} max={100} value={s.autoGenerate.minScore} onChange={(v) => set({ autoGenerate: { ...s.autoGenerate, minScore: v } })} />
            <NumberField label="At most this many a day" min={0} max={50} value={s.autoGenerate.maxPerDay} onChange={(v) => set({ autoGenerate: { ...s.autoGenerate, maxPerDay: v } })} />
          </div>
        </div>
      </Section>

      <Section title="Free filters" desc="Applied before any AI runs, so you never pay to judge a job you'd never want.">
        <div className="fields two">
          <TextField wide label="Skip jobs with these words in the title" value={list(s.excludeTitleWords)} onChange={(v) => set({ excludeTitleWords: unlist(v) })} />
          <TextField
            wide
            label="Remote jobs must be open to"
            hint="Remote jobs with no location rule are always kept."
            value={list(s.remoteRegionsAllowed)}
            onChange={(v) => set({ remoteRegionsAllowed: unlist(v) })}
          />
        </div>
      </Section>

      <Section
        title="Companies to watch"
        desc={
          <>
            Many companies post jobs on Greenhouse, Lever or Ashby. Use the last part of their careers link, for example
            jobs.lever.co/<b>name</b>. Only jobs in Australia or remote are kept.
          </>
        }
      >
        {s.watchedCompanies.length ? (
          <div className="chips" style={{ marginBottom: 16 }}>
            {s.watchedCompanies.map((c, i) => (
              <span key={i} className="chip">
                <span className="chip-label" style={{ display: "inline-flex", alignItems: "center" }}>
                  {c.slug}
                </span>
                <span className="chip-sub">{c.ats}</span>
                <button
                  className="icon-btn"
                  title="Remove"
                  aria-label={`Remove ${c.slug}`}
                  onClick={() => set({ watchedCompanies: s.watchedCompanies.filter((_, k) => k !== i) })}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ width: 160 }}>
            <SelectField
              label="Job board"
              value={newCompany.ats}
              onChange={(v) => setNewCompany({ ...newCompany, ats: v })}
              options={[
                { value: "greenhouse", label: "Greenhouse" },
                { value: "lever", label: "Lever" },
                { value: "ashby", label: "Ashby" },
              ]}
            />
          </div>
          <div style={{ flex: "1 1 200px", maxWidth: 280 }}>
            <label htmlFor={slugId}>Company name in the link</label>
            <input id={slugId} type="text" placeholder="linear" value={newCompany.slug} onChange={(e) => setNewCompany({ ...newCompany, slug: e.target.value })} />
          </div>
          <button
            disabled={!newCompany.slug.trim()}
            onClick={() => {
              set({ watchedCompanies: [...s.watchedCompanies, { ats: newCompany.ats as any, slug: newCompany.slug.trim() }] });
              setNewCompany({ ...newCompany, slug: "" });
            }}
          >
            <Plus size={15} aria-hidden /> Add company
          </button>
        </div>
      </Section>

      <Section
        title="Chrome extension"
        desc="Fills job application forms with your details, tailored resume and cover letter. You review and submit."
      >
        <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>
            In Chrome, open <b>chrome://extensions</b> and turn on <b>Developer mode</b> (top right).
          </li>
          <li>
            Click <b>Load unpacked</b> and choose the <b>extension</b> folder inside your Auto Job Apply project.
          </li>
          <li>Pin it from the puzzle-piece menu, click its icon, and connect with this address and your app login:</li>
        </ol>
        <div className="row" style={{ marginTop: 12 }}>
          <input type="text" readOnly value={typeof window === "undefined" ? "" : window.location.origin} aria-label="App address" style={{ maxWidth: 360 }} />
          <button className="btn-sm" onClick={() => navigator.clipboard.writeText(window.location.origin)}>
            Copy address
          </button>
        </div>
        <p className="hint">
          On Greenhouse, Lever, Ashby, Workday, SmartRecruiters, PageUp and similar sites it fills the form by itself when the job is
          in your list (open it with Apply here first). On other sites, click the extension and choose Fill the form on this page. It
          never presses Submit. Questions it can&apos;t answer from your profile use the Application answers limit, usually a few cents
          per form.
        </p>
      </Section>

      <Section title="Connections" desc="Set in .env.local on your computer, or in Vercel's environment variables once it's online.">
        <ul className="checklist">
          {connections.map((c) => (
            <li key={c.text}>
              {c.ok ? <Check size={16} className="good" aria-hidden /> : <Circle size={16} className={c.optional ? "muted" : "bad"} aria-hidden />}
              <span>
                {c.text}
                {!c.ok ? <span className={c.optional ? "muted" : "bad"}>{c.optional ? ", optional" : ", missing"}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ marginTop: 12 }}>
          Database: {meta.env.database === "neon" ? "Neon Postgres" : "stored on this computer"}.
        </p>
      </Section>

      <div className="save-bar">
        <AsyncButton className="btn-primary" onClick={() => save()} busyLabel="Saving…">
          Save settings
        </AsyncButton>
      </div>
    </>
  );
}
