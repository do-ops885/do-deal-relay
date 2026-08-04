import { AIGatewayClient } from "./client";
import { buildGatewayConfig } from "./config";
import type { GatewayMessage } from "./types";

import type { Ai } from "../research-agent/scrapers/base";

interface GatewayWorkersAIEnv {
  AI?: Ai;
  AI_GATEWAY_URL?: string;
  AI_GATEWAY_ENABLED?: string;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_MODEL?: string;
}

type NativeAiRun = (model: string, input: unknown) => Promise<unknown>;

function isGatewayEnabled(env: GatewayWorkersAIEnv): boolean {
  return (
    env.AI_GATEWAY_ENABLED === "true" &&
    Boolean(env.AI_GATEWAY_URL) &&
    Boolean(env.AI_GATEWAY_API_KEY)
  );
}

function toMessages(input: unknown): GatewayMessage[] | null {
  if (typeof input === "object" && input !== null) {
    const candidate = input as { messages?: unknown; prompt?: unknown };
    if (Array.isArray(candidate.messages)) {
      const messages = candidate.messages.filter(
        (message): message is GatewayMessage => {
          if (typeof message !== "object" || message === null) return false;
          const value = message as Record<string, unknown>;
          return (
            (value.role === "system" ||
              value.role === "user" ||
              value.role === "assistant") &&
            typeof value.content === "string"
          );
        },
      );
      return messages.length > 0 ? messages : null;
    }
    if (typeof candidate.prompt === "string") {
      return [{ role: "user", content: candidate.prompt }];
    }
  }
  return null;
}

function fromGatewayResponse(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const response = data as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? { response: content } : data;
}

/**
 * Run Workers AI through the native binding by default.
 *
 * Gateway routing is deliberately opt-in: it requires AI_GATEWAY_ENABLED=true,
 * AI_GATEWAY_URL, and AI_GATEWAY_API_KEY. If the gateway rejects or cannot
 * represent the request, the native binding remains the compatibility path.
 */
export async function runWorkersAI(
  env: GatewayWorkersAIEnv,
  model: string,
  input: unknown,
): Promise<unknown> {
  if (!env.AI) throw new Error("Workers AI binding unavailable");

  const nativeRun = env.AI.run.bind(env.AI) as NativeAiRun;
  if (!isGatewayEnabled(env)) return nativeRun(model, input);

  const messages = toMessages(input);
  if (!messages) return nativeRun(model, input);

  const config = buildGatewayConfig(env);
  const client = new AIGatewayClient(config);
  const result = await client.forward(
    {
      model: env.AI_GATEWAY_MODEL ?? model,
      messages,
      temperature:
        typeof input === "object" &&
        input !== null &&
        typeof (input as { temperature?: unknown }).temperature === "number"
          ? (input as { temperature: number }).temperature
          : undefined,
      max_tokens:
        typeof input === "object" &&
        input !== null &&
        typeof (input as { max_tokens?: unknown }).max_tokens === "number"
          ? (input as { max_tokens: number }).max_tokens
          : undefined,
    },
    env.AI_GATEWAY_API_KEY as string,
  );

  return result.ok ? fromGatewayResponse(result.data) : nativeRun(model, input);
}
