import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isGatewayEnabled,
  runLLMWithGateway,
} from "../../worker/lib/ai-gateway/llm";
import type { Env } from "../../worker/types";

vi.mock("../../worker/lib/ai-gateway/client", () => ({
  AIGatewayClient: vi.fn(),
}));

vi.mock("../../worker/lib/ai-gateway/config", () => ({
  buildGatewayConfig: vi.fn(),
}));

import { AIGatewayClient } from "../../worker/lib/ai-gateway/client";
import { buildGatewayConfig } from "../../worker/lib/ai-gateway/config";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI_GATEWAY_URL: "",
    ENVIRONMENT: "test",
    ...overrides,
  } as unknown as Env;
}

describe("ai-gateway llm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isGatewayEnabled false when url empty", () => {
    expect(isGatewayEnabled(makeEnv({ AI_GATEWAY_URL: "" }))).toBe(false);
    expect(isGatewayEnabled(makeEnv({ AI_GATEWAY_URL: "  " }))).toBe(false);
  });

  it("isGatewayEnabled true when url set", () => {
    expect(
      isGatewayEnabled(
        makeEnv({ AI_GATEWAY_URL: "https://gateway.example/v1" }),
      ),
    ).toBe(true);
  });

  it("uses direct ai.run when gateway disabled", async () => {
    const ai = {
      run: vi.fn(async () => ({ response: "direct" })),
    } as unknown as Ai;
    const res = await runLLMWithGateway(
      makeEnv({ AI_GATEWAY_URL: "" }),
      ai,
      "llama-3",
      "hello",
    );
    expect(res).toEqual({ response: "direct" });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it("returns gateway content without fallback on ok", async () => {
    const mockForward = vi.fn(async () => ({
      ok: true,
      data: { choices: [{ message: { content: "gw-answer" } }] },
      latencyMs: 5,
      cached: false,
      statusCode: 200,
    }));
    vi.mocked(AIGatewayClient).mockImplementation(function (this: unknown) {
      return { forward: mockForward };
    } as never);
    vi.mocked(buildGatewayConfig).mockReturnValue({
      gatewayUrl: "https://gw.example",
    } as never);

    const ai = { run: vi.fn(async () => ({ response: "fallback" })) };
    const res = await runLLMWithGateway(
      makeEnv({ AI_GATEWAY_URL: "https://gw.example" }),
      ai as unknown as Ai,
      "llama-3",
      "hi",
    );
    expect(res).toEqual({ response: "gw-answer" });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("falls back to direct on gateway failure", async () => {
    const mockForward = vi.fn(async () => ({
      ok: false,
      data: null,
      statusCode: 500,
      latencyMs: 5,
      cached: false,
    }));
    vi.mocked(AIGatewayClient).mockImplementation(function (this: unknown) {
      return { forward: mockForward };
    } as never);
    vi.mocked(buildGatewayConfig).mockReturnValue({
      gatewayUrl: "https://gw.example",
    } as never);

    const ai = { run: vi.fn(async () => ({ response: "direct-fb" })) };
    const res = await runLLMWithGateway(
      makeEnv({ AI_GATEWAY_URL: "https://gw.example" }),
      ai as unknown as Ai,
      "test-model",
      "prompt",
    );
    expect(res).toEqual({ response: "direct-fb" });
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it("falls back to direct on gateway exception", async () => {
    vi.mocked(AIGatewayClient).mockImplementation(() => {
      throw new Error("boom");
    });
    vi.mocked(buildGatewayConfig).mockReturnValue({
      gatewayUrl: "https://gw.example",
    } as never);
    const ai = { run: vi.fn(async () => ({ response: "fb2" })) };
    const res = await runLLMWithGateway(
      makeEnv({ AI_GATEWAY_URL: "https://gw.example" }),
      ai as unknown as Ai,
      "m",
      "p",
    );
    expect(res).toEqual({ response: "fb2" });
  });
});
