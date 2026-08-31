/* eslint-disable */
/**
 * AI Gateway LLM Helper
 *
 * Routes Cloudflare Workers AI chat completions through the AI Gateway
 * when AI_GATEWAY_URL is configured. Provides caching, retries, and
 * failover via AIGatewayClient, with transparent fallback to direct
 * ai.run() when gateway is unavailable or disabled.
 *
 * @module worker/lib/ai-gateway/llm
 */

import { AIGatewayClient } from "./client";
import { buildGatewayConfig } from "./config";
import type { GatewayRequest } from "./types";
import type { Env } from "../../types";
import { logger } from "../global-logger";
import { toError } from "../sanitize-error";

type AiRunFn = (model: string, inputs: unknown) => Promise<unknown>;

const COMPONENT = "ai-gateway-llm";

/** Map Workers AI model to gateway/OpenAI model when needed. */
function mapModelForGateway(workersModel: string): string {
  // Workers AI llama -> OpenAI gpt-4o-mini for gateway proxy
  if (workersModel.includes("llama")) return "gpt-4o-mini";
  if (workersModel.includes("bge")) return workersModel; // embeddings passthrough
  return workersModel;
}

/** Extract readable text from an OpenAI-compatible gateway response. */
function extractGatewayContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  // OpenAI chat completion shape
  if (Array.isArray(obj.choices)) {
    const first = obj.choices[0] as Record<string, unknown> | undefined;
    if (first) {
      if (
        first.message &&
        typeof first.message === "object" &&
        first.message !== null
      ) {
        const msg = first.message as Record<string, unknown>;
        if (typeof msg.content === "string" && msg.content.trim()) {
          return msg.content;
        }
      }
      // Some providers return `text` directly
      if (typeof first.text === "string" && first.text.trim())
        return first.text;
    }
  }
  // Workers AI shape tunneled through gateway
  if (typeof obj.response === "string" && obj.response.trim()) {
    return obj.response;
  }
  if (typeof obj.content === "string" && obj.content.trim()) return obj.content;
  return null;
}

/** Check if AI Gateway should be used for this environment. */
export function isGatewayEnabled(env: Env): boolean {
  return Boolean(env.AI_GATEWAY_URL && env.AI_GATEWAY_URL.trim().length > 0);
}

/**
 * Run an LLM chat completion, preferring the AI Gateway when configured.
 *
 * Flow:
 * 1. If gateway disabled -> direct ai.run
 * 2. Try gateway forward (messages: [{role:user, content:prompt}])
 * 3. On gateway success with extractable content -> return {response: content}
 * 4. On gateway failure/ empty -> fallback to direct ai.run
 *
 * The return shape mirrors Workers AI: { response: string } so callers
 * do not need branching.
 */
export async function runLLMWithGateway(
  env: Env,
  ai: Ai,
  model: string,
  prompt: string,
  options: { max_tokens?: number; temperature?: number } = {},
): Promise<{ response: string }> {
  // eslint-disable-next-line @typescript-eslint/require-await
  const directFallback = async (): Promise<{ response: string }> => {
    const result = (await (ai.run as AiRunFn)(model, {
      prompt,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
    })) as { response?: string; content?: string };
    // Normalize to { response }
    if (typeof result.response === "string")
      return { response: result.response };
    if (typeof result.content === "string") return { response: result.content };
    return { response: "" };
  };

  if (!isGatewayEnabled(env)) {
    return directFallback();
  }

  try {
    const config = buildGatewayConfig(env);
    if (!config.gatewayUrl) return directFallback();

    const client = new AIGatewayClient(config);
    const gatewayModel = mapModelForGateway(model);

    const gatewayRequest: GatewayRequest = {
      model: gatewayModel,
      messages: [{ role: "user", content: prompt }],
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens,
    };

    // Use empty token fallback – gateway client will still send Bearer header.
    // In production this would be an OpenAI key stored as a secret.
    const envRecord = env as unknown as Record<string, unknown>;
    const authToken =
      (envRecord.OPENAI_API_KEY as string | undefined) ??
      (envRecord.AI_GATEWAY_TOKEN as string | undefined) ??
      "";

    const res = await client.forward(gatewayRequest, authToken);

    if (res.ok && res.data) {
      const content = extractGatewayContent(res.data);
      if (content !== null) {
        logger.debug("LLM via AI Gateway succeeded", {
          component: COMPONENT,
          model,
          gatewayModel,
          latencyMs: res.latencyMs,
          cached: res.cached,
        });
        return { response: content };
      }
      logger.warn(
        "AI Gateway returned ok but no extractable content, falling back",
        {
          component: COMPONENT,
          model,
        },
      );
    } else {
      logger.warn("AI Gateway forward failed, falling back to direct", {
        component: COMPONENT,
        model,
        statusCode: res.statusCode,
      });
    }
  } catch (error) {
    const err = toError(error);
    logger.warn("AI Gateway exception, falling back to direct AI", {
      component: COMPONENT,
      model,
      error: err.message,
    });
  }

  return directFallback();
}
