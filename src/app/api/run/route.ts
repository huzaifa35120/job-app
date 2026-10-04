import { readJson, route } from "@/lib/api";
import { documentsNow, runAllSearchesNow, scoreNow } from "@/lib/pipeline";

export const maxDuration = 300;

/** Manual buttons on the dashboard. */
export const POST = route(async (req) => {
  const { action } = await readJson(req);
  if (action === "search") return runAllSearchesNow();
  if (action === "score") return scoreNow();
  if (action === "documents") return documentsNow();
  throw new Error(`Unknown action: ${action}`);
});
