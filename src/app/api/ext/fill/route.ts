import { answerFormFields, type FormField } from "@/lib/ai";
import { extOptions, extRoute, readJson } from "@/lib/api";
import { letterAsText } from "@/lib/ext";
import { getJob } from "@/lib/jobs";
import { getProfile, profileIsEmpty } from "@/lib/profile";
import { getSettings } from "@/lib/settings";

export const maxDuration = 120;
export const OPTIONS = extOptions();

/** AI answers for the form fields the extension couldn't fill from your profile directly. */
export const POST = extRoute(async (req) => {
  const body = await readJson(req);
  const fields: FormField[] = (Array.isArray(body.fields) ? body.fields : []).map((f: any) => ({
    id: String(f.id ?? ""),
    label: String(f.label ?? ""),
    kind: String(f.kind ?? "text"),
    options: Array.isArray(f.options) ? f.options.map(String) : [],
    required: Boolean(f.required),
    maxLength: Number(f.maxLength) || null,
  }));
  if (!fields.length) return { fields: [], cost: 0 };
  const profile = await getProfile();
  if (profileIsEmpty(profile)) throw new Error("Fill in your profile in the app first.");
  const job = body.jobId ? await getJob(Number(body.jobId)) : null;
  return answerFormFields(
    {
      job,
      page: { url: String(body.page?.url ?? ""), title: String(body.page?.title ?? "") },
      fields,
      coverLetter: letterAsText(job?.cover_letter, profile.personal.fullName),
    },
    profile,
    await getSettings(),
  );
});
