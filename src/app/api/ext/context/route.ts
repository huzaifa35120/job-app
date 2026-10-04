import { extOptions, extRoute, readJson } from "@/lib/api";
import { candidateJobs, findJobForPage } from "@/lib/ext";
import { getProfile } from "@/lib/profile";

export const OPTIONS = extOptions();

/** Everything the extension needs for a page: the matching job, other likely jobs, and your profile. */
export const POST = extRoute(async (req) => {
  const { url = "", title = "", text = "" } = await readJson(req);
  const [match, candidates, profile] = await Promise.all([
    findJobForPage({ url: String(url), title: String(title), text: String(text) }),
    candidateJobs(),
    getProfile(),
  ]);
  return { ...match, candidates, profile };
});
