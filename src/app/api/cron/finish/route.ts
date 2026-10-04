import { cronRoute } from "@/lib/api";
import { dailyFinish } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const GET = cronRoute(() => dailyFinish());
