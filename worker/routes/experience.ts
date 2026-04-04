import type { Env } from "../types";
import { jsonResponse } from "./utils";
import { createStructuredLogger } from "../lib/logger";
import {
  submitExperienceEvent,
  getExperienceAggregate,
  runAggregation,
} from "../lib/d1/experience";

function getExperienceLogger(env: Env) {
  return createStructuredLogger(env, "experience-routes", `exp-${Date.now()}`);
}

export async function handleSubmitExperience(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  if (request.headers.get("Content-Type") !== "application/json") {
    return jsonResponse(
      { error: "Content-Type must be application/json" },
      415,
    );
  }

  let body: {
    deal_code?: string;
    event_type?: string;
    agent_id?: string;
    score?: number;
    metadata?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { deal_code, event_type, agent_id, score, metadata } = body;

  if (!deal_code || !event_type) {
    return jsonResponse(
      { error: "deal_code and event_type are required" },
      400,
    );
  }

  const validTypes = ["click", "view", "conversion", "feedback"];
  if (!validTypes.includes(event_type)) {
    return jsonResponse(
      { error: `Invalid event_type. Must be one of: ${validTypes.join(", ")}` },
      400,
    );
  }

  if (score !== undefined) {
    if (!Number.isInteger(score) || score < -100 || score > 100) {
      return jsonResponse(
        { error: "score must be an integer between -100 and 100" },
        400,
      );
    }
  }

  const eventId = crypto.randomUUID();
  const metadataStr = metadata ? JSON.stringify(metadata) : undefined;

  const logger = getExperienceLogger(env);
  logger.info("Submitting experience event", {
    component: "experience",
    deal_code,
    event_type,
  });

  const result = await submitExperienceEvent(env.DEALS_DB, {
    id: eventId,
    deal_code,
    event_type,
    agent_id,
    score,
    metadata: metadataStr,
  });

  if (!result.success) {
    logger.error(
      "Failed to submit experience event",
      new Error(result.error || "Unknown error"),
      {
        component: "experience",
      },
    );
    return jsonResponse({ error: "Failed to submit experience event" }, 500);
  }

  return jsonResponse(
    {
      success: true,
      event_id: eventId,
      deal_code,
      event_type,
    },
    201,
  );
}

export async function handleGetExperience(
  dealCode: string,
  env: Env,
): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  if (!dealCode) {
    return jsonResponse({ error: "deal_code is required" }, 400);
  }

  const result = await getExperienceAggregate(env.DEALS_DB, dealCode);

  if (!result.success) {
    return jsonResponse({ error: "Failed to retrieve experience data" }, 500);
  }

  if (!result.aggregate) {
    return jsonResponse(
      {
        deal_code: dealCode,
        total_events: 0,
        positive_events: 0,
        negative_events: 0,
        avg_score: 0,
        last_updated: null,
      },
      200,
    );
  }

  return jsonResponse({
    success: true,
    aggregate: result.aggregate,
  });
}

export async function handleRunAggregation(env: Env): Promise<Response> {
  if (!env.DEALS_DB) {
    return jsonResponse({ error: "D1 database not configured" }, 503);
  }

  const logger = getExperienceLogger(env);
  logger.info("Running experience aggregation", { component: "experience" });

  const result = await runAggregation(env.DEALS_DB);

  if (!result.success) {
    logger.error(
      "Aggregation failed",
      new Error(result.error || "Unknown error"),
      {
        component: "experience",
      },
    );
    return jsonResponse({ error: "Aggregation failed" }, 500);
  }

  return jsonResponse({
    success: true,
    deals_processed: result.dealsProcessed,
    events_processed: result.eventsProcessed,
  });
}
