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
