import { writeDocuments } from "@/lib/ai";
import { route } from "@/lib/api";
import { getJob } from "@/lib/jobs";
import { getProfile, profileIsEmpty } from "@/lib/profile";
import { getSettings } from "@/lib/settings";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (_req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job) throw new Error("Job not found");
  const profile = await getProfile();
  if (profileIsEmpty(profile)) throw new Error("Fill in your Profile first.");
  const docs = await writeDocuments(job, profile, await getSettings());
  return { ...docs, job: await getJob(job.id) };
});
