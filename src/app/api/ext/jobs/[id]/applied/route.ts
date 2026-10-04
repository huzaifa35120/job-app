import { extOptions, extRoute } from "@/lib/api";
import { updateJob } from "@/lib/jobs";

export const OPTIONS = extOptions();

type Ctx = { params: Promise<{ id: string }> };

export const POST = extRoute<Ctx>(async (_req, { params }) => {
  const job = await updateJob(Number((await params).id), { status: "applied" });
  if (!job) throw new Error("Job not found");
  return { ok: true };
});
