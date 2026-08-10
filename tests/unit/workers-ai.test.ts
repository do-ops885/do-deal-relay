import { describe, expect, it, vi } from "vitest";
import { runWorkersAI } from "../../worker/lib/ai-gateway/workers-ai";

describe("runWorkersAI", () => {
  it("uses the native AI binding when gateway routing is disabled", async () => {
    const run = vi.fn().mockResolvedValue({ response: "native result" });
    const input = { prompt: "find referral deals" };

    const result = await runWorkersAI(
      {
        AI: { run },
        AI_GATEWAY_URL: "https://gateway.example",
        AI_GATEWAY_ENABLED: "false",
      },
      "@cf/meta/llama-3-8b-instruct",
      input,
    );

    expect(result).toEqual({ response: "native result" });
    expect(run).toHaveBeenCalledWith("@cf/meta/llama-3-8b-instruct", input);
  });

  it("rejects when the native AI binding is unavailable", async () => {
    await expect(
      runWorkersAI({}, "@cf/meta/llama-3-8b-instruct", {
        prompt: "find referral deals",
      }),
    ).rejects.toThrow("Workers AI binding unavailable");
  });
});
