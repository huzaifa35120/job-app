import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { rememberOpenedJob } from "@/lib/ext";
import { getJob } from "@/lib/jobs";

type Ctx = { params: Promise<{ id: string }> };

/** "Apply" in the app goes through here, so the extension knows which job you're applying for. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job || !/^https?:\/\//.test(job.url)) throw new Error("This job has no link.");
  await rememberOpenedJob(job.id);
  return NextResponse.redirect(job.url);
});
