import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import {
  addResearchSource,
  getResearchSources,
  getSourceByName,
  registerKnownProgram,
  getSourceApiConfig,
  updateSourceApiConfig,
  getApiEnabledSources,
  getSourceRateLimit,
  getSourceAuthEnvVars,
} from "../../worker/lib/research-agent/sources";
import {
  RESEARCH_SOURCES,
  KNOWN_REFERRAL_PROGRAMS,
} from "../../worker/lib/research-agent/types";

let originalSources: typeof RESEARCH_SOURCES;
let originalPrograms: typeof KNOWN_REFERRAL_PROGRAMS;

beforeAll(() => {
  originalSources = [...RESEARCH_SOURCES];
  originalPrograms = { ...KNOWN_REFERRAL_PROGRAMS };
});

afterAll(() => {
  RESEARCH_SOURCES.length = 0;
  RESEARCH_SOURCES.push(...originalSources);
  RESEARCH_SOURCES.sort((a, b) => a.priority - b.priority);
  Object.keys(KNOWN_REFERRAL_PROGRAMS).forEach(
    (key) => delete KNOWN_REFERRAL_PROGRAMS[key],
  );
  Object.assign(KNOWN_REFERRAL_PROGRAMS, originalPrograms);
});

describe("research-agent/sources", () => {
  it("should get available sources", () => {
    const sources = getResearchSources();
    expect(sources.length).toBeGreaterThan(0);
  });

  it("should get source by name", () => {
    const ph = getSourceByName("producthunt");
    expect(ph).toBeDefined();
    expect(ph?.name).toBe("producthunt");
  });

  it("should add a research source", () => {
    const initialCount = getResearchSources().length;
    addResearchSource({
      name: "new_source",
      priority: 10,
      description: "New source",
      enabled: true,
      apiConfig: { type: "direct", url: "https://example.com" },
    });
    const sources = getResearchSources();
    expect(sources.length).toBe(initialCount + 1);
    expect(getSourceByName("new_source")).toBeDefined();
  });

  it("should register known programs", () => {
    registerKnownProgram("test.com", {
      patterns: ["test"],
      urlFormats: ["test.com/ref"],
      typicalRewards: ["$10"],
    });
    // Internal state check via other methods or just verifying no crash
  });

  it("should get source API config", () => {
    const config = getSourceApiConfig("producthunt");
    expect(config).toBeDefined();
  });

  it("should update source API config", () => {
    updateSourceApiConfig("producthunt", { endpoint: "https://new.ph.api" });
    const config = getSourceApiConfig("producthunt");
    expect(config?.endpoint).toBe("https://new.ph.api");
  });

  it("should return false when updating non-existent source", () => {
    expect(updateSourceApiConfig("non-existent", {})).toBe(false);
  });

  it("should get API enabled sources", () => {
    const sources = getApiEnabledSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(
      sources.every((s) => s.apiConfig && s.apiConfig.type !== "direct"),
    ).toBe(true);
  });

  it("should get source rate limits", () => {
    const limit = getSourceRateLimit("github");
    expect(limit.requestsPerMinute).toBe(30);

    const defaultLimit = getSourceRateLimit("unknown");
    expect(defaultLimit.requestsPerMinute).toBe(60);
  });

  it("should get source auth env vars", () => {
    const vars = getSourceAuthEnvVars("reddit");
    expect(vars.clientId).toBe("REDDIT_CLIENT_ID");

    const emptyVars = getSourceAuthEnvVars("unknown");
    expect(emptyVars).toEqual({});
  });
});
