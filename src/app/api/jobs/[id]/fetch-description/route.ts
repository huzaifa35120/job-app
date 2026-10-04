import { route } from "@/lib/api";
import { fetchFullDescription, getJob, updateJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

/** Free: downloads the posting page and stores its text as the full description. */
export const POST = route<Ctx>(async (_req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job) throw new Error("Job not found");
  const text = await fetchFullDescription(job);
  return { job: await updateJob(job.id, { full_description: text }) };
});
