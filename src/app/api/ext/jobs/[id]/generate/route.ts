import { writeDocuments } from "@/lib/ai";
import { extOptions, extRoute } from "@/lib/api";
import { getJob } from "@/lib/jobs";
import { getProfile, profileIsEmpty } from "@/lib/profile";
import { getSettings } from "@/lib/settings";

export const maxDuration = 300;
export const OPTIONS = extOptions();

type Ctx = { params: Promise<{ id: string }> };

export const POST = extRoute<Ctx>(async (_req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job) throw new Error("Job not found");
  const profile = await getProfile();
  if (profileIsEmpty(profile)) throw new Error("Fill in your profile in the app first.");
  const { cost } = await writeDocuments(job, profile, await getSettings());
  return { ok: true, cost };
});
