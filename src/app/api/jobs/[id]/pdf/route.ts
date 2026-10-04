import { route } from "@/lib/api";
import { getJob } from "@/lib/jobs";
import { renderCoverLetterPdf, renderResumePdf } from "@/lib/pdf";
import { getProfile } from "@/lib/profile";

type Ctx = { params: Promise<{ id: string }> };

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";

export const GET = route<Ctx>(async (req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job) throw new Error("Job not found");
  const doc = new URL(req.url).searchParams.get("doc") === "cover" ? "cover" : "resume";
  const profile = await getProfile();
  const name = slug(profile.personal.fullName || "resume");

  let pdf: Buffer;
  let filename: string;
  if (doc === "resume") {
    if (!job.resume) throw new Error("No resume generated for this job yet.");
    pdf = await renderResumePdf(job.resume, profile);
    filename = `${name}-Resume-${slug(job.company)}.pdf`;
  } else {
    if (!job.cover_letter) throw new Error("No cover letter generated for this job yet.");
    pdf = await renderCoverLetterPdf(job.cover_letter, profile, job.company);
    filename = `${name}-Cover-Letter-${slug(job.company)}.pdf`;
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.get("download") ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
});
