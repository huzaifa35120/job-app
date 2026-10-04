// The four things Claude does: match jobs, write documents, answer application questions, import a resume.

import { z } from "zod";
import { callClaudeJson } from "./claude";
import { query } from "./db";
import { jobDescription, type JobRow } from "./jobs";
import {
  EducationSchema,
  ExperienceSchema,
  ProfileSchema,
  ProjectSchema,
  SkillGroupSchema,
  profileForMatching,
  type Profile,
} from "./profile";
import type { Settings } from "./settings";

// ---------------------------------------------------------------- matching

const ScoreResults = z.object({
  results: z.array(
    z.object({
      job_id: z.number().int(),
      score: z.number().int(),
      verdict: z.enum(["strong", "good", "maybe", "weak", "ineligible"]),
      reason: z.string(),
      matched: z.array(z.string()),
      gaps: z.array(z.string()),
    }),
  ),
});

const SCORING_INSTRUCTIONS = `You screen job postings for one candidate and rate how well each job fits them.

Score each job 0-100:
- 85-100 "strong": meets nearly all key requirements; a realistic chance of an interview.
- 70-84 "good": meets most requirements, with a couple of gaps.
- 50-69 "maybe": partial fit.
- 21-49 "weak": major gaps (seniority, years of experience, core skills).
- 0-20 "ineligible": the candidate clearly cannot apply - work rights, citizenship or security clearance they don't have, a remote role that excludes people in Australia, a licence they lack.

Be realistic about seniority: a student or graduate is a weak fit for roles that need 5+ years.
reason: one or two plain-English sentences naming the deciding factors.
matched / gaps: up to 5 short items each.
Return exactly one result per job, using the job's id.`;

function jobForPrompt(job: JobRow, maxChars: number): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company || "(unknown)"}`,
    `Location: ${job.location || "(unknown)"}${job.remote ? " [remote]" : ""}`,
    job.salary ? `Salary: ${job.salary}` : "",
    job.posted_at ? `Posted: ${new Date(job.posted_at).toISOString().slice(0, 10)}` : "",
    `Description:\n${jobDescription(job).slice(0, maxChars)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Scores up to ~5 jobs in one request (the profile is sent once per batch, which keeps it cheap). */
export async function scoreJobs(jobs: JobRow[], profile: Profile, settings: Settings): Promise<number> {
  if (!jobs.length) return 0;
  const { data, cost } = await callClaudeJson(
    {
      category: "scoring",
      operation: "score_jobs",
      model: settings.models.scoring,
      detail: `Matched ${jobs.length} job${jobs.length > 1 ? "s" : ""}: ${jobs.map((j) => j.title).join(", ").slice(0, 200)}`,
      system: [
        {
          type: "text",
          text: `${SCORING_INSTRUCTIONS}\n\n<candidate>\n${profileForMatching(profile)}\n</candidate>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: jobs.map((j) => `<job id="${j.id}">\n${jobForPrompt(j, 2500)}\n</job>`).join("\n\n"),
        },
      ],
      maxTokens: 4000,
      effort: "low",
      expectedOutputTokens: 200 * jobs.length,
    },
    ScoreResults,
  );

  const share = cost / jobs.length;
  let updated = 0;
  for (const r of data.results) {
    if (!jobs.some((j) => j.id === r.job_id)) continue;
    await query(
      `UPDATE jobs SET score = $2, verdict = $3, score_reason = $4, score_details = $5::jsonb, scored_at = now()
       WHERE id = $1`,
      [
        r.job_id,
        Math.max(0, Math.min(100, r.score)),
        r.verdict,
        r.reason,
        JSON.stringify({ matched: r.matched, gaps: r.gaps, cost: share }),
      ],
    );
    updated++;
  }
  return updated;
}

// ---------------------------------------------------------------- resume + cover letter

export const TailoredResumeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(SkillGroupSchema),
  experience: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema),
  education: z.array(EducationSchema),
  certifications: z.array(z.string()),
  extras: z.array(z.string()),
});
export type TailoredResume = z.infer<typeof TailoredResumeSchema>;

export const CoverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  sign_off: z.string(),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

const DocumentsSchema = z.object({
  resume: TailoredResumeSchema,
  cover_letter: CoverLetterSchema,
  notes: z.object({ emphasized: z.array(z.string()), review_flags: z.array(z.string()) }),
});

function writingInstructions(profile: Profile): string {
  const banned = profile.bannedPhrases.filter(Boolean);
  return `You write a tailored one-page resume and a cover letter for the candidate below, for one specific job.

TRUTHFULNESS (most important)
- Use ONLY facts from the candidate profile. Never invent employers, titles, dates, degrees, skills, tools, numbers or achievements.
- You may rephrase, reorder, merge, shorten, and choose which items to include. Mirror the job's wording only where the profile supports it.
- If the job asks for something the candidate lacks, don't claim it - leave it out and mention it in notes.review_flags.

RESUME
- Must fit on one page: a 2-3 sentence summary; up to 4 skill groups ordered by relevance to this job; the most relevant experience first with 2-4 bullets each; the 2-3 most relevant projects with 1-3 bullets each; education; certifications and extras only if relevant.
- Bullets start with a strong verb, are concrete, keep any numbers from the profile, and never use first person.
- Keep company names, job titles, institutions and dates exactly as in the profile.
- headline: one short line tailored to this role, e.g. "Computer Science Graduate · React & Node.js Developer".
- Leave out contact details - they are added automatically.

COVER LETTER
- 250-350 words in 3-4 paragraphs, addressed to the hiring team (use a person's name only if the posting gives one).
- Open with the specific role and a genuine, specific reason for interest taken from the posting. Then give 2-3 concrete examples from the profile that match the job's top requirements. Close with availability and a simple call to action.
- Sound like a real person: plain, confident and specific. ${profile.writingSample ? "Match the tone of the candidate's writing sample." : ""}
- Never use these words or phrases: ${banned.length ? banned.map((b) => `"${b}"`).join(", ") : "(none listed)"}. Avoid cliches and filler.
- Use Australian English spelling for Australian employers; otherwise match the posting's spelling.
- greeting like "Dear Hiring Team,"; sign_off like "Kind regards," (the candidate's name is added after it automatically).

NOTES
- emphasized: 3-5 short notes on what you chose to highlight and why.
- review_flags: things the candidate should check before sending (requirements they may not meet, assumptions, details missing from the profile). Empty if none.`;
}

function profileForWriting(profile: Profile): string {
  const { writingSample, bannedPhrases, ...rest } = profile;
  void bannedPhrases;
  return `<candidate_profile>\n${JSON.stringify(rest, null, 1)}\n</candidate_profile>${
    writingSample ? `\n\n<writing_sample>\n${writingSample}\n</writing_sample>` : ""
  }`;
}

export async function writeDocuments(job: JobRow, profile: Profile, settings: Settings, auto = false) {
  const { data, cost } = await callClaudeJson(
    {
      category: "documents",
      operation: "write_documents",
      model: settings.models.documents,
      jobId: job.id,
      detail: `Resume + cover letter: ${job.title} at ${job.company}${auto ? " (auto)" : ""}`,
      system: [
        {
          type: "text",
          text: `${writingInstructions(profile)}\n\n${profileForWriting(profile)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `<job>\n${jobForPrompt(job, 9000)}\n</job>\n\nWrite the tailored resume and cover letter for this job.` }],
      maxTokens: 16000,
      effort: "high",
      expectedOutputTokens: 5000,
    },
    DocumentsSchema,
  );
  await query(
    `UPDATE jobs SET resume = $2::jsonb, cover_letter = $3::jsonb, doc_notes = $4::jsonb,
            docs_generated_at = now(), docs_auto = $5 WHERE id = $1`,
    [job.id, JSON.stringify(data.resume), JSON.stringify(data.cover_letter), JSON.stringify(data.notes), auto],
  );
  return { ...data, cost };
}

// ---------------------------------------------------------------- application questions

const AnswersSchema = z.object({
  answers: z.array(z.object({ question: z.string(), answer: z.string(), needs_input: z.boolean() })),
});

export async function answerQuestions(job: JobRow, questions: string, profile: Profile, settings: Settings) {
  const { data, cost } = await callClaudeJson(
    {
      category: "apply",
      operation: "answer_questions",
      model: settings.models.apply,
      jobId: job.id,
      detail: `Application answers: ${job.title} at ${job.company}`,
      system: [
        {
          type: "text",
          text: `You draft answers to job application questions for the candidate below.
- Use only facts from the profile. Never invent experience, numbers or qualifications.
- If an answer needs information the profile doesn't have (e.g. notice period, salary, references), write the best draft with a [FILL IN: ...] placeholder and set needs_input to true.
- Respect any word or character limits mentioned in a question. Be specific and plain; no cliches.
- Use Australian English spelling for Australian employers.
- Never use these words or phrases: ${profile.bannedPhrases.join(", ") || "(none)"}.

${profileForWriting(profile)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `<job>\n${jobForPrompt(job, 6000)}\n</job>\n\n<questions>\n${questions}\n</questions>\n\nDraft an answer for each question, in order.`,
        },
      ],
      maxTokens: 8000,
      effort: "medium",
      expectedOutputTokens: 1500,
    },
    AnswersSchema,
  );
  await query("UPDATE jobs SET answers = $2::jsonb WHERE id = $1", [job.id, JSON.stringify(data.answers)]);
  return { answers: data.answers, cost };
}

// ---------------------------------------------------------------- resume import

export async function importResume(
  input: { pdfBase64?: string; text?: string },
  settings: Settings,
): Promise<{ profile: Profile; cost: number }> {
  const instructions = `Extract the candidate's details from this resume into the profile structure.
- Copy facts faithfully; keep bullet wording as written (fix obvious typos only). Never invent anything.
- Missing information: use an empty string or empty list.
- Keep dates as written (e.g. "Feb 2024", "Present").
- Group skills into sensible categories (e.g. Languages, Frameworks & Libraries, Tools, Data, Soft skills).
- workRights, availability, salaryExpectation and preferences: fill only if the resume states them.
- targetRoles: suggest 3-5 realistic job titles this person should search for, based on the resume.
- headline: one line describing the candidate; summary: 2-3 sentences based only on the resume.
- writingSample and extraNotes: empty string. bannedPhrases: empty list.`;

  const content: any[] = input.pdfBase64
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } },
        { type: "text", text: instructions },
      ]
    : [{ type: "text", text: `<resume>\n${input.text}\n</resume>\n\n${instructions}` }];

  const pdfPages = input.pdfBase64 ? Math.max(1, Math.round((input.pdfBase64.length * 0.75) / 60_000)) : 0;
  const { data, cost } = await callClaudeJson(
    {
      category: "profile",
      operation: "import_resume",
      model: settings.models.profile,
      detail: input.pdfBase64 ? "Imported resume (PDF)" : "Imported resume (text)",
      system: "You turn resumes into structured profile data, accurately and without adding anything.",
      messages: [{ role: "user", content }],
      maxTokens: 16000,
      effort: "medium",
      expectedOutputTokens: 5000,
      estimatedInputTokens: input.pdfBase64 ? 1000 + Math.min(pdfPages, 5) * 3000 : undefined,
    },
    ProfileSchema,
  );
  return { profile: data, cost };
}
