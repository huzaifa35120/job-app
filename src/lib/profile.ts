import { z } from "zod";
import { kvGet, kvSet } from "./db";

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  bullets: z.array(z.string()),
});

export const ProjectSchema = z.object({
  name: z.string(),
  tech: z.string(),
  link: z.string(),
  bullets: z.array(z.string()),
});

export const EducationSchema = z.object({
  degree: z.string(),
  institution: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  details: z.array(z.string()),
});

export const SkillGroupSchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const PersonalSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedin: z.string(),
  github: z.string(),
  website: z.string(),
});

/** Everything the AI is allowed to use when writing resumes, cover letters and answers. */
export const ProfileSchema = z.object({
  personal: PersonalSchema,
  headline: z.string(),
  summary: z.string(),
  targetRoles: z.array(z.string()),
  workRights: z.string(),
  availability: z.string(),
  salaryExpectation: z.string(),
  preferences: z.string(),
  skills: z.array(SkillGroupSchema),
  experience: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema),
  education: z.array(EducationSchema),
  certifications: z.array(z.string()),
  achievements: z.array(z.string()),
  extras: z.array(z.string()),
  writingSample: z.string(),
  bannedPhrases: z.array(z.string()),
  extraNotes: z.string(),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const EMPTY_PROFILE: Profile = {
  personal: { fullName: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  headline: "",
  summary: "",
  targetRoles: [],
  workRights: "",
  availability: "",
  salaryExpectation: "",
  preferences: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  achievements: [],
  extras: [],
  writingSample: "",
  bannedPhrases: ["passionate", "thrilled", "leverage", "synergy", "dynamic", "rockstar", "ninja", "I am excited to apply"],
  extraNotes: "",
};

export async function getProfile(): Promise<Profile> {
  const stored = await kvGet<Partial<Profile>>("profile");
  return { ...EMPTY_PROFILE, ...(stored ?? {}), personal: { ...EMPTY_PROFILE.personal, ...(stored?.personal ?? {}) } };
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const parsed = ProfileSchema.parse(profile);
  await kvSet("profile", parsed);
  return parsed;
}

export function profileIsEmpty(p: Profile): boolean {
  return !p.personal.fullName && p.experience.length === 0 && p.projects.length === 0 && p.skills.length === 0;
}

/** Compact text version of the profile for matching (keeps scoring prompts small). */
export function profileForMatching(p: Profile): string {
  const lines: string[] = [];
  lines.push(`Headline: ${p.headline || "(none)"}`);
  lines.push(`Based in: ${p.personal.location || "(unknown)"}`);
  lines.push(`Work rights: ${p.workRights || "(not stated)"}`);
  lines.push(`Availability: ${p.availability || "(not stated)"}`);
  lines.push(`Target roles: ${p.targetRoles.join(", ") || "(not stated)"}`);
  if (p.preferences) lines.push(`Preferences: ${p.preferences}`);
  if (p.skills.length) lines.push(`Skills: ${p.skills.map((s) => `${s.category}: ${s.items.join(", ")}`).join(" | ")}`);
  if (p.experience.length) {
    lines.push("Experience:");
    for (const e of p.experience) {
      lines.push(`- ${e.title} at ${e.company} (${e.start}–${e.end})${e.bullets[0] ? `: ${e.bullets.slice(0, 2).join("; ")}` : ""}`);
    }
  }
  if (p.projects.length) {
    lines.push("Projects:");
    for (const pr of p.projects) lines.push(`- ${pr.name} [${pr.tech}]`);
  }
  if (p.education.length) {
    lines.push("Education:");
    for (const ed of p.education) lines.push(`- ${ed.degree}, ${ed.institution} (${ed.start}–${ed.end})`);
  }
  if (p.certifications.length) lines.push(`Certifications: ${p.certifications.join(", ")}`);
  return lines.join("\n");
}
