import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { ReferralInput } from "../worker/types";

/**
 * Agent URL Preservation Test
 *
 * Verifies that when an agent queries the system for a referral code,
 * the system returns the COMPLETE FULL URL, not a shortened version.
 */
describe("Agent URL Preservation", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
  let baseUrl: string;

  beforeAll(async () => {
    proxy = await getPlatformProxy({});
    baseUrl = "http://localhost";
  });

  afterAll(async () => {
    await proxy.dispose();
  });

  it("should store and return COMPLETE link for picnic referral", async () => {
    // Agent adds a referral with complete link
    const completeUrl = "https://picnic.app/de/freunde-rabatt/DOMI6869";

    const createResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "DOMI6869",
          url: completeUrl,
          domain: "picnic.app",
          source: "api",
          submitted_by: "test-agent",
          metadata: {
            title: "Picnic Referral",
            reward_type: "unknown",
            category: ["grocery"],
          },
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createData = (await createResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Verify: Create response includes COMPLETE URL
    expect(createData.success).toBe(true);
    expect(createData.referral.url).toBe(completeUrl);
    expect(createData.referral.code).toBe("DOMI6869");
    expect(createData.referral.domain).toBe("picnic.app");

    console.log(
      "✓ Create response includes full URL:",
      createData.referral.url,
    );
  });

  it("should return COMPLETE link when agent queries by code", async () => {
    const completeUrl = "https://picnic.app/de/freunde-rabatt/DOMI6869";

    // Agent queries for the referral code
    const getResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/DOMI6869`,
    );

    expect(getResponse.status).toBe(200);
    const getData = (await getResponse.json()) as { referral: ReferralInput };

    // Verify: Get response includes COMPLETE URL
    expect(getData.referral.url).toBe(completeUrl);
    expect(getData.referral.code).toBe("DOMI6869");
    expect(getData.referral.domain).toBe("picnic.app");

    console.log("✓ Get by code returns full URL:", getData.referral.url);
  });

  it("should return COMPLETE links when agent lists referrals", async () => {
    const completeUrl = "https://picnic.app/de/freunde-rabatt/DOMI6869";

    // Agent lists all referrals for picnic.app
    const listResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals?domain=picnic.app&status=all`,
    );

    expect(listResponse.status).toBe(200);
    const listData = (await listResponse.json()) as {
      referrals: ReferralInput[];
      total: number;
    };

    // Verify: List response includes COMPLETE URLs
    expect(listData.total).toBeGreaterThan(0);

    const picnicReferral = listData.referrals.find(
      (r) => r.code === "DOMI6869",
    );

    expect(picnicReferral).toBeDefined();
    expect(picnicReferral!.url).toBe(completeUrl);

    console.log("✓ List response includes full URL:", picnicReferral!.url);
  });

  it("should return COMPLETE link after deactivation", async () => {
    const completeUrl = "https://picnic.app/de/freunde-rabatt/DOMI6869";

    // Agent deactivates the code
    const deactivateResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/DOMI6869/deactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "expired",
          notes: "Test deactivation",
        }),
      },
    );

    expect(deactivateResponse.status).toBe(200);
    const deactivateData = (await deactivateResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Verify: Deactivate response includes COMPLETE URL
    expect(deactivateData.success).toBe(true);
    expect(deactivateData.referral.url).toBe(completeUrl);
    expect(deactivateData.referral.status).toBe("inactive");

    console.log(
      "✓ Deactivate response includes full URL:",
      deactivateData.referral.url,
    );
  });

  it("should return COMPLETE link after reactivation", async () => {
    const completeUrl = "https://picnic.app/de/freunde-rabatt/DOMI6869";

    // Agent reactivates the code
    const reactivateResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/DOMI6869/reactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(reactivateResponse.status).toBe(200);
    const reactivateData = (await reactivateResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Verify: Reactivate response includes COMPLETE URL
    expect(reactivateData.success).toBe(true);
    expect(reactivateData.referral.url).toBe(completeUrl);
    expect(reactivateData.referral.status).toBe("active");

    console.log(
      "✓ Reactivate response includes full URL:",
      reactivateData.referral.url,
    );
  });

  it("should handle smart-add with complete URL", async () => {
    // Add another referral using smart-add pattern
    const completeUrl = "https://trading212.com/invite/ABCDEF123";

    const createResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "ABCDEF123",
          url: completeUrl,
          domain: "trading212.com",
          source: "api",
          metadata: {
            title: "Trading212 Referral",
            reward_type: "cash",
          },
        }),
      },
    );

    expect(createResponse.status).toBe(201);
    const createData = (await createResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Verify: Complete URL preserved exactly
    expect(createData.referral.url).toBe(completeUrl);
    expect(createData.referral.url).not.toBe(
      "https://trading212.com/ABCDEF123",
    );
    expect(createData.referral.url).not.toBe("trading212.com/invite/ABCDEF123");

    console.log(
      "✓ Smart-add preserves complete URL path:",
      createData.referral.url,
    );
  });
});
