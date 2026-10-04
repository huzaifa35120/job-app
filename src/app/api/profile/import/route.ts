import { importResume } from "@/lib/ai";
import { route } from "@/lib/api";
import { getProfile } from "@/lib/profile";
import { getSettings } from "@/lib/settings";

export const maxDuration = 300;

/** Reads an uploaded resume (PDF, or pasted text) and returns a filled-in profile. Not saved until you press Save. */
export const POST = route(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  const text = String(form.get("text") ?? "").trim();
  let input: { pdfBase64?: string; text?: string };

  if (file instanceof File && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) throw new Error("That file is over 4 MB. Export a smaller PDF.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      input = { pdfBase64: bytes.toString("base64") };
    } else if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) {
      input = { text: bytes.toString("utf8") };
    } else {
      throw new Error("Upload a PDF (or .txt). For Word files, save as PDF first or paste the text.");
    }
  } else if (text) {
    input = { text };
  } else {
    throw new Error("Upload a resume PDF or paste your resume text.");
  }

  const current = await getProfile();
  const { profile, cost } = await importResume(input, await getSettings());
  // Keep the fields a resume doesn't contain.
  return {
    profile: {
      ...profile,
      writingSample: current.writingSample,
      bannedPhrases: current.bannedPhrases,
      extraNotes: current.extraNotes,
      salaryExpectation: profile.salaryExpectation || current.salaryExpectation,
      workRights: profile.workRights || current.workRights,
      availability: profile.availability || current.availability,
      preferences: profile.preferences || current.preferences,
    },
    cost,
  };
});
