import type { Env } from "../../types";
import { jsonResponse } from "../utils";
import { getSuggestions } from "../../lib/nlq/suggestions";
import { classifyIntent } from "../../lib/nlq/intent";

export async function handleSuggestions(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const q = url.searchParams.get("q") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 8;

  if (q.length > 500) {
    return jsonResponse(
      { error: "Query too long", code: "QUERY_TOO_LONG" },
      400,
      request,
      env,
    );
  }

  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(limit, 1), 20)
    : 8;
  const suggestions = getSuggestions(q, safeLimit);
  const intent = q ? classifyIntent(q) : null;

  return jsonResponse(
    {
      success: true,
      query: q,
      intent: intent
        ? { intent: intent.intent, confidence: intent.confidence }
        : null,
      count: suggestions.length,
      suggestions: suggestions.map((s) => s.text),
      detailed: suggestions,
    },
    200,
    request,
    env,
  );
}
