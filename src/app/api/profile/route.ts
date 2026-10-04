import { readJson, route } from "@/lib/api";
import { getProfile, saveProfile } from "@/lib/profile";

export const GET = route(async () => ({ profile: await getProfile() }));

export const PUT = route(async (req) => {
  const body = await readJson(req);
  return { profile: await saveProfile(body.profile) };
});
