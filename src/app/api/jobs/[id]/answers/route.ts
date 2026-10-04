import { answerQuestions } from "@/lib/ai";
import { readJson, route } from "@/lib/api";
import { getJob } from "@/lib/jobs";
import { getProfile, profileIsEmpty } from "@/lib/profile";
import { getSettings } from "@/lib/settings";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const job = await getJob(Number((await params).id));
  if (!job) throw new Error("Job not found");
  const { questions = "" } = await readJson(req);
  if (!String(questions).trim()) throw new Error("Paste the application questions first.");
  const profile = await getProfile();
  if (profileIsEmpty(profile)) throw new Error("Fill in your Profile first.");
  return answerQuestions(job, String(questions).slice(0, 8000), profile, await getSettings());
});
