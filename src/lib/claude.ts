import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolUnion,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { costFor, priceFor, type TokenCounts } from "./pricing";
import type { Category } from "./settings";
import { checkLimit, finishUsage, startUsage } from "./usage";

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local (local) or the Vercel project's Environment Variables.");
  }
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

/** Models that should be called with server-side refusal fallbacks. */
const FALLBACK_MODELS = ["claude-opus-5", "claude-fable-5-1"];
/** Models that reject the `effort` parameter. */
const NO_EFFORT_MODELS = ["claude-haiku-4-5"];

export interface ClaudeCall {
  category: Category;
  operation: string;
  model: string;
  jobId?: number | null;
  detail?: string;
  system: string | BetaTextBlockParam[];
  messages: BetaMessageParam[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  tools?: BetaToolUnion[];
  /** Rough expected output size, used for the pre-call spending estimate. */
  expectedOutputTokens: number;
  /** Override the input-token estimate (e.g. for PDFs). */
  estimatedInputTokens?: number;
  /** Rough number of web searches, used for the pre-call estimate. */
  expectedWebSearches?: number;
}

function estimateInputTokens(call: ClaudeCall): number {
  if (call.estimatedInputTokens) return call.estimatedInputTokens;
  const chars = JSON.stringify(call.system).length + JSON.stringify(call.messages).length;
  return Math.ceil(chars / 3.5) + 300;
}

export function estimateCost(call: ClaudeCall): number {
  const p = priceFor(call.model);
  return (
    (estimateInputTokens(call) * p.input + call.expectedOutputTokens * p.output) / 1_000_000 +
    (call.expectedWebSearches ?? 0) * 0.01
  );
}

function tokensFrom(usage: BetaMessage["usage"]): TokenCounts {
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    webSearches: usage.server_tool_use?.web_search_requests ?? 0,
  };
}

function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    webSearches: a.webSearches + b.webSearches,
  };
}

/** Cost of one response. When a refusal fallback ran, each iteration is billed at its own model's rate. */
function costOf(response: BetaMessage, requestedModel: string): number {
  const iterations = response.usage.iterations ?? [];
  if (iterations.some((it) => it.type === "fallback_message")) {
    let total = 0;
    for (const it of iterations as any[]) {
      if (it.type === "compaction") continue;
      total += costFor(it.model ?? requestedModel, {
        input: it.input_tokens ?? 0,
        output: it.output_tokens ?? 0,
        cacheRead: it.cache_read_input_tokens ?? 0,
        cacheWrite: it.cache_creation_input_tokens ?? 0,
        webSearches: 0,
      });
    }
    return total + (response.usage.server_tool_use?.web_search_requests ?? 0) * 0.01;
  }
  return costFor(response.model || requestedModel, tokensFrom(response.usage));
}

export class ClaudeError extends Error {}

/**
 * Calls Claude after checking the category's daily limit, and records the exact
 * tokens and cost in usage_log. Handles pause_turn continuations for server tools.
 */
export async function callClaude(call: ClaudeCall, outputFormat?: { type: "json_schema"; schema: Record<string, unknown> }) {
  const estimate = estimateCost(call);
  await checkLimit(call.category, estimate);
  const anthropic = getClient();

  const usageId = await startUsage({
    category: call.category,
    operation: call.operation,
    model: call.model,
    jobId: call.jobId,
    detail: call.detail,
  });
  const started = Date.now();
  let tokens: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  let cost = 0;
  let servedBy = call.model;

  try {
    const outputConfig: Record<string, unknown> = {};
    if (outputFormat) outputConfig.format = outputFormat;
    if (call.effort && !NO_EFFORT_MODELS.includes(call.model)) outputConfig.effort = call.effort;
    const useFallbacks = FALLBACK_MODELS.includes(call.model);

    const messages = [...call.messages];
    let response: BetaMessage | null = null;
    // A server tool (web search) may pause a long turn; re-send to let it continue.
    for (let attempt = 0; attempt < 3; attempt++) {
      const params: MessageCreateParamsNonStreaming = {
        model: call.model,
        max_tokens: call.maxTokens,
        system: call.system,
        messages,
        ...(call.tools ? { tools: call.tools } : {}),
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig as any } : {}),
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      };
      response = await anthropic.beta.messages.create(params);
      tokens = addTokens(tokens, tokensFrom(response.usage));
      cost += costOf(response, call.model);
      servedBy = response.model || call.model;
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content as any });
    }

    if (!response) throw new ClaudeError("No response from Claude.");
    if (response.stop_reason === "refusal") {
      throw new ClaudeError("Claude declined this request. Try rephrasing or a different model.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ClaudeError("Claude's answer was cut off (max_tokens). Try again; if it keeps happening, shorten the input.");
    }

    await finishUsage(usageId, { model: servedBy, tokens, cost, durationMs: Date.now() - started, status: "ok" });
    return { response, cost, tokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishUsage(usageId, {
      model: servedBy,
      tokens,
      cost,
      durationMs: Date.now() - started,
      status: "error",
      detail: `${call.detail ? call.detail + " — " : ""}ERROR: ${message.slice(0, 300)}`,
    }).catch(() => {});
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ClaudeError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ClaudeError("Anthropic rate limit hit. Wait a minute and try again.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new ClaudeError(`Anthropic API error ${err.status ?? ""}: ${message}`);
    }
    throw err;
  }
}

/** Calls Claude with a structured-output schema and returns the parsed, validated object. */
export async function callClaudeJson<S extends z.ZodType>(call: ClaudeCall, schema: S) {
  const format = zodOutputFormat(schema);
  const { response, cost } = await callClaude(call, { type: "json_schema", schema: format.schema });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  return { data: format.parse(text) as z.infer<S>, cost };
}
