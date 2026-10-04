import { extOptions, extRoute } from "@/lib/api";
import { fileSlug, letterAsText, profileAsResume } from "@/lib/ext";
import { getJob } from "@/lib/jobs";
import { renderCoverLetterPdf, renderResumePdf } from "@/lib/pdf";
import { getProfile } from "@/lib/profile";

export const OPTIONS = extOptions();

type Ctx = { params: Promise<{ id: string }> };

/** The PDFs to attach. Job id 0 means "no job": a plain resume from the profile. */
export const GET = extRoute<Ctx>(async (_req, { params }) => {
  const id = Number((await params).id);
  const profile = await getProfile();
  const name = fileSlug(profile.personal.fullName || "Resume");
  const job = id ? await getJob(id) : null;

  const tailored = Boolean(job?.resume);
  const resumePdf = await renderResumePdf(job?.resume ?? profileAsResume(profile), profile);
  const coverPdf = job?.cover_letter ? await renderCoverLetterPdf(job.cover_letter, profile, job.company) : null;
  const company = job ? `-${fileSlug(job.company)}` : "";

  return {
    tailored,
    resume: { name: `${name}-Resume${company}.pdf`, base64: Buffer.from(resumePdf).toString("base64") },
    cover: coverPdf ? { name: `${name}-Cover-Letter${company}.pdf`, base64: Buffer.from(coverPdf).toString("base64") } : null,
    coverText: letterAsText(job?.cover_letter, profile.personal.fullName),
  };
});
