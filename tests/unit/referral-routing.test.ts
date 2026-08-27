import { describe, it, expect } from "vitest";

describe("New split regex check", () => {
  const actionRegex = /^\/api\/referrals\/([^/]+)\/(deactivate|reactivate)$/;
  const detailRegex = /^\/api\/referrals\/([^/]+)$/;

  it("should match deactivate route correctly", () => {
    const path = "/api/referrals/MYCODE123/deactivate";
    const match = path.match(actionRegex);

    expect(match).not.toBeNull();
    expect(match![1]).toBe("MYCODE123");
    expect(match![2]).toBe("deactivate");
  });

  it("should match reactivate route correctly", () => {
    const path = "/api/referrals/MYCODE123/reactivate";
    const match = path.match(actionRegex);

    expect(match).not.toBeNull();
    expect(match![1]).toBe("MYCODE123");
    expect(match![2]).toBe("reactivate");
  });

  it("should match GET route correctly", () => {
    const path = "/api/referrals/MYCODE123";
    const match = path.match(detailRegex);

    expect(match).not.toBeNull();
    expect(match![1]).toBe("MYCODE123");
  });

  it("should NOT match action route for detail regex", () => {
    const path = "/api/referrals/MYCODE123/deactivate";
    const match = path.match(detailRegex);
    expect(match).toBeNull();
  });

  it("should NOT match detail route for action regex", () => {
    const path = "/api/referrals/MYCODE123";
    const match = path.match(actionRegex);
    expect(match).toBeNull();
  });
});

describe("handleCreateReferral SSRF Validation", () => {
  it("should reject creation if URL points to prohibited loopback/private IP", async () => {
    const { handleCreateReferral } =
      await import("../../worker/routes/referrals");
    const mockEnv = {} as any;

    const request = new Request("https://example.com/api/referrals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: "TEST1234",
        url: "https://127.0.0.1/ref",
        domain: "127.0.0.1",
      }),
    });

    const response = await handleCreateReferral(request, mockEnv);
    expect(response.status).toBe(400);

    const data = (await response.json()) as {
      error?: string;
      message?: string;
    };
    expect(data.error).toBe("Disallowed URL");
    expect(data.message).toContain("SSRF protection");
  });
});
