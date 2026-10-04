"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Plus, Trash2, Upload } from "lucide-react";
import { Alert, AsyncButton, ErrorBox } from "@/components/ui";
import { api, usd } from "@/lib/client";
import type { Profile } from "@/lib/profile";

// Lists are edited as raw text (one per line / comma separated) and cleaned on save,
// so typing a newline or comma doesn't get swallowed.
const lines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n");
const commas = (a: string[]) => a.join(",");
const fromCommas = (s: string) => s.split(",");

function clean(p: Profile): Profile {
  const t = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  return {
    ...p,
    targetRoles: t(p.targetRoles),
    skills: p.skills.map((s) => ({ ...s, items: t(s.items) })).filter((s) => s.category.trim() || s.items.length),
    experience: p.experience.map((e) => ({ ...e, bullets: t(e.bullets) })),
    projects: p.projects.map((e) => ({ ...e, bullets: t(e.bullets) })),
    education: p.education.map((e) => ({ ...e, details: t(e.details) })),
    certifications: t(p.certifications),
    achievements: t(p.achievements),
    extras: t(p.extras),
    bannedPhrases: t(p.bannedPhrases),
  };
}

function Field({
  label,
  value,
  onChange,
  area,
  placeholder,
  hint,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={wide ? "span-all" : undefined}>
      <label htmlFor={id}>{label}</label>
      {area ? (
        <textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function ListArea({ label, value, onChange, placeholder, wide }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; wide?: boolean }) {
  const id = useId();
  return (
    <div className={wide ? "span-all" : undefined}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={lines(value)} placeholder={placeholder} onChange={(e) => onChange(fromLines(e.target.value))} />
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
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

function Entries<T>({
  items,
  onChange,
  empty,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  empty: T;
  addLabel: string;
  render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="entry">
          {render(item, (patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))))}
          <div className="entry-actions">
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up" aria-label="Move up">
              <ChevronUp size={17} aria-hidden />
            </button>
            <button className="icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label="Move down">
              <ChevronDown size={17} aria-hidden />
            </button>
            <button className="icon-btn" onClick={() => onChange(items.filter((_, k) => k !== i))} title="Remove" aria-label="Remove">
              <Trash2 size={17} aria-hidden />
            </button>
          </div>
        </div>
      ))}
      <button className="btn-sm" style={{ marginTop: items.length ? 16 : 0 }} onClick={() => onChange([...items, structuredClone(empty)])}>
        <Plus size={15} aria-hidden /> {addLabel}
      </button>
    </>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [dirty, setDirty] = useState(false);
  const rolesId = useId();
  const bannedId = useId();

  useEffect(() => {
    api("/api/profile")
      .then((d) => setP(d.profile))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!p) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Profile</h1>
        </div>
        <ErrorBox error={error} />
      </>
    );
  }

  const set = (patch: Partial<Profile>) => {
    setP({ ...p, ...patch });
    setDirty(true);
  };
  const setPersonal = (patch: Partial<Profile["personal"]>) => set({ personal: { ...p.personal, ...patch } });

  async function importResume() {
    setError(null);
    setMessage(null);
    const form = new FormData();
    if (file) form.append("file", file);
    if (pasted.trim()) form.append("text", pasted);
    try {
      const res = await api("/api/profile/import", { method: "POST", body: form });
      setP(res.profile);
      setDirty(true);
      setMessage(`Your resume is in (AI cost ${usd(res.cost)}). Check the details below, then save.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setError(null);
    setMessage(null);
    try {
      const res = await api("/api/profile", { method: "PUT", json: { profile: clean(p!) } });
      setP(res.profile);
      setDirty(false);
      setMessage("Profile saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-lede">
            Everything the AI is allowed to use when it matches jobs and writes for you. It never adds anything that isn&apos;t
            here, so real detail (projects, numbers, tools) makes better resumes.
          </p>
        </div>
      </div>

      <div className="panel" style={{ padding: 24 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 20 }}>
          <div style={{ maxWidth: 520 }}>
            <h2 className="section-title" style={{ fontSize: 20 }}>
              Start from your resume
            </h2>
            <p className="section-sub">Upload a PDF and the form below fills itself in. A one-off cost of about $0.05 to $0.20.</p>
          </div>
          <div className="row">
            <input type="file" accept="application/pdf,.pdf,.txt" aria-label="Resume file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <AsyncButton className="btn-primary" onClick={importResume} disabled={!file && !pasted.trim()} busyLabel="Reading, 20 to 60 seconds">
              <Upload size={15} aria-hidden /> Fill in from resume
            </AsyncButton>
          </div>
        </div>
        <details style={{ marginTop: 14 }}>
          <summary>
            <ChevronRight size={15} aria-hidden /> No PDF? Paste the text instead
          </summary>
          <textarea aria-label="Resume text" value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ minHeight: 140 }} />
        </details>
      </div>

      <ErrorBox error={error} />
      {message ? <Alert tone="ok">{message}</Alert> : null}

      <div style={{ marginTop: 16 }}>
        <Section title="Contact details" desc="Printed at the top of every resume and cover letter.">
          <div className="fields">
            <Field label="Full name" value={p.personal.fullName} onChange={(v) => setPersonal({ fullName: v })} />
            <Field label="Email" value={p.personal.email} onChange={(v) => setPersonal({ email: v })} />
            <Field label="Phone" value={p.personal.phone} onChange={(v) => setPersonal({ phone: v })} />
            <Field label="Location" value={p.personal.location} onChange={(v) => setPersonal({ location: v })} placeholder="Sydney, NSW" />
            <Field label="LinkedIn" value={p.personal.linkedin} onChange={(v) => setPersonal({ linkedin: v })} />
            <Field label="GitHub" value={p.personal.github} onChange={(v) => setPersonal({ github: v })} />
            <Field label="Website or portfolio" value={p.personal.website} onChange={(v) => setPersonal({ website: v })} />
          </div>
        </Section>

        <Section title="What you're after" desc="Your target roles are searched every morning and show up on Today.">
          <div className="fields two">
            <div className="span-all">
              <label htmlFor={rolesId}>Target roles, separated by commas</label>
              <input
                id={rolesId}
                type="text"
                value={commas(p.targetRoles)}
                onChange={(e) => set({ targetRoles: fromCommas(e.target.value) })}
                placeholder="Junior Software Engineer, Graduate Developer, Data Analyst"
              />
            </div>
            <Field label="Work rights" value={p.workRights} onChange={(v) => set({ workRights: v })} placeholder="Australian citizen" />
            <Field label="Availability" value={p.availability} onChange={(v) => set({ availability: v })} placeholder="Full-time from December 2026" />
            <Field label="Salary expectation" value={p.salaryExpectation} onChange={(v) => set({ salaryExpectation: v })} placeholder="$75k to $85k plus super" />
            <Field label="Preferences" value={p.preferences} onChange={(v) => set({ preferences: v })} placeholder="Hybrid or remote, no sales roles" />
          </div>
        </Section>

        <Section title="About you" desc="A one-line headline and a short summary the AI can tailor.">
          <div className="fields two">
            <Field label="Headline" wide value={p.headline} onChange={(v) => set({ headline: v })} placeholder="Computer Science student and full-stack developer" />
            <Field label="Summary" wide area value={p.summary} onChange={(v) => set({ summary: v })} />
          </div>
        </Section>

        <Section title="Skills" desc="Group them however suits you, for example languages, frameworks and tools.">
          <Entries
            items={p.skills}
            addLabel="Add a skill group"
            onChange={(skills) => set({ skills })}
            empty={{ category: "", items: [] }}
            render={(s, u) => (
              <div className="fields two">
                <Field label="Group" value={s.category} onChange={(v) => u({ category: v })} placeholder="Languages" />
                <Field label="Skills, separated by commas" value={commas(s.items)} onChange={(v) => u({ items: fromCommas(v) })} />
              </div>
            )}
          />
        </Section>

        <Section title="Experience" desc="One line per thing you did. Include numbers and tools wherever you can.">
          <Entries
            items={p.experience}
            addLabel="Add a job"
            onChange={(experience) => set({ experience })}
            empty={{ title: "", company: "", location: "", start: "", end: "", bullets: [] }}
            render={(e, u) => (
              <div className="fields">
                <Field label="Title" value={e.title} onChange={(v) => u({ title: v })} />
                <Field label="Company" value={e.company} onChange={(v) => u({ company: v })} />
                <Field label="Location" value={e.location} onChange={(v) => u({ location: v })} />
                <Field label="Start" value={e.start} onChange={(v) => u({ start: v })} placeholder="Feb 2024" />
                <Field label="End" value={e.end} onChange={(v) => u({ end: v })} placeholder="Present" />
                <ListArea wide label="What you did, one per line" value={e.bullets} onChange={(bullets) => u({ bullets })} />
              </div>
            )}
          />
        </Section>

        <Section title="Projects" desc="Uni, personal or hackathon projects all count.">
          <Entries
            items={p.projects}
            addLabel="Add a project"
            onChange={(projects) => set({ projects })}
            empty={{ name: "", tech: "", link: "", bullets: [] }}
            render={(e, u) => (
              <div className="fields">
                <Field label="Name" value={e.name} onChange={(v) => u({ name: v })} />
                <Field label="Built with" value={e.tech} onChange={(v) => u({ tech: v })} placeholder="React, Node.js, PostgreSQL" />
                <Field label="Link" value={e.link} onChange={(v) => u({ link: v })} />
                <ListArea wide label="Details, one per line" value={e.bullets} onChange={(bullets) => u({ bullets })} />
              </div>
            )}
          />
        </Section>

        <Section title="Education">
          <Entries
            items={p.education}
            addLabel="Add education"
            onChange={(education) => set({ education })}
            empty={{ degree: "", institution: "", location: "", start: "", end: "", details: [] }}
            render={(e, u) => (
              <div className="fields">
                <Field label="Degree" value={e.degree} onChange={(v) => u({ degree: v })} />
                <Field label="Institution" value={e.institution} onChange={(v) => u({ institution: v })} />
                <Field label="Location" value={e.location} onChange={(v) => u({ location: v })} />
                <Field label="Start" value={e.start} onChange={(v) => u({ start: v })} />
                <Field label="End" value={e.end} onChange={(v) => u({ end: v })} placeholder="Expected Nov 2026" />
                <ListArea wide label="WAM, relevant units, awards, one per line" value={e.details} onChange={(details) => u({ details })} />
              </div>
            )}
          />
        </Section>

        <Section title="Everything else">
          <div className="fields two">
            <ListArea label="Certifications, one per line" value={p.certifications} onChange={(certifications) => set({ certifications })} />
            <ListArea label="Awards and achievements, one per line" value={p.achievements} onChange={(achievements) => set({ achievements })} />
            <ListArea label="Volunteering, languages, interests, one per line" value={p.extras} onChange={(extras) => set({ extras })} />
            <Field label="Anything else the AI should know" area value={p.extraNotes} onChange={(v) => set({ extraNotes: v })} placeholder="Leave my retail job off tech applications" />
          </div>
        </Section>

        <Section title="Your writing voice" desc="Cover letters follow the tone of your own writing and never use the phrases you ban.">
          <div className="fields two">
            <Field label="A paragraph you wrote yourself" wide area value={p.writingSample} onChange={(v) => set({ writingSample: v })} />
            <div className="span-all">
              <label htmlFor={bannedId}>Never use these words or phrases, separated by commas</label>
              <input id={bannedId} type="text" value={commas(p.bannedPhrases)} onChange={(e) => set({ bannedPhrases: fromCommas(e.target.value) })} />
            </div>
          </div>
        </Section>
      </div>

      <div className="save-bar">
        <AsyncButton className="btn-primary" onClick={save} busyLabel="Saving…">
          Save profile
        </AsyncButton>
        {dirty ? <span className="dirty">You have unsaved changes</span> : <span className="small muted">All changes saved</span>}
      </div>
    </>
  );
}
