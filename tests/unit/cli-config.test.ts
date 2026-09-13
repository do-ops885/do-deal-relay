import { describe, it, expect, beforeEach } from "vitest";
import { config, setApiKey, clearApiKey } from "../../scripts/cli/config";

describe("cli config api key", () => {
  beforeEach(() => {
    clearApiKey();
  });

  it("stores the api key set by login", () => {
    setApiKey("test-key");
    expect(config.apiKey).toBe("test-key");
  });

  it("removes the api key on logout", () => {
    setApiKey("test-key");
    clearApiKey();
    expect(config.apiKey).toBeUndefined();
    expect("apiKey" in config).toBe(false);
  });
});
