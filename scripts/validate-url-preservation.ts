#!/usr/bin/env node
/**
 * Agent URL Preservation Validation
 *
 * This script validates that the API correctly stores and returns
 * COMPLETE FULL URLs when agents query the system.
 *
 * Run: npx ts-node scripts/validate-url-preservation.ts
 */

import { getPlatformProxy } from "wrangler";
import type { ReferralInput } from "../worker/types";

const TEST_URL = "https://picnic.app/de/freunde-rabatt/DOMI6869";
const TEST_CODE = "DOMI6869";
const TEST_DOMAIN = "picnic.app";

async function validateUrlPreservation(): Promise<void> {
  console.log("========================================");
  console.log("Agent URL Preservation Validation");
  console.log("========================================\n");

  const proxy = await getPlatformProxy({});
  const baseUrl = "http://localhost";

  try {
    // Step 1: Create referral with complete URL
    console.log("Step 1: Creating referral with complete URL...");
    console.log(`  Input URL: ${TEST_URL}`);

    const createResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: TEST_CODE,
          url: TEST_URL,
          domain: TEST_DOMAIN,
          source: "validation-test",
          submitted_by: "test-agent",
          metadata: {
            title: "Picnic Referral",
            reward_type: "unknown",
            category: ["grocery"],
          },
        }),
      },
    );

    if (createResponse.status !== 201) {
      throw new Error(`Create failed with status ${createResponse.status}`);
    }

    const createData = (await createResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Validate: Create response includes COMPLETE URL
    if (createData.referral.url !== TEST_URL) {
      throw new Error(
        `FAIL: Create response URL mismatch!\n` +
          `  Expected: ${TEST_URL}\n` +
          `  Got: ${createData.referral.url}`,
      );
    }
    console.log(
      `  ✓ Create response includes full URL: ${createData.referral.url}\n`,
    );

    // Step 2: Query by code (Agent asks for referral)
    console.log("Step 2: Agent querying by code...");
    console.log(`  Query: GET /api/referrals/${TEST_CODE}`);

    const getResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/${TEST_CODE}`,
    );

    if (getResponse.status !== 200) {
      throw new Error(`Get failed with status ${getResponse.status}`);
    }

    const getData = (await getResponse.json()) as { referral: ReferralInput };

    // Validate: Get response includes COMPLETE URL
    if (getData.referral.url !== TEST_URL) {
      throw new Error(
        `FAIL: Get response URL mismatch!\n` +
          `  Expected: ${TEST_URL}\n` +
          `  Got: ${getData.referral.url}`,
      );
    }
    console.log(
      `  ✓ Get response includes full URL: ${getData.referral.url}\n`,
    );

    // Step 3: List referrals (Agent searches for domain)
    console.log("Step 3: Agent listing referrals for domain...");
    console.log(`  Query: GET /api/referrals?domain=${TEST_DOMAIN}`);

    const listResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals?domain=${TEST_DOMAIN}&status=all`,
    );

    if (listResponse.status !== 200) {
      throw new Error(`List failed with status ${listResponse.status}`);
    }

    const listData = (await listResponse.json()) as {
      referrals: ReferralInput[];
      total: number;
    };

    const foundReferral = listData.referrals.find((r) => r.code === TEST_CODE);
    if (!foundReferral) {
      throw new Error(`Referral not found in list response`);
    }

    // Validate: List response includes COMPLETE URL
    if (foundReferral.url !== TEST_URL) {
      throw new Error(
        `FAIL: List response URL mismatch!\n` +
          `  Expected: ${TEST_URL}\n` +
          `  Got: ${foundReferral.url}`,
      );
    }
    console.log(`  ✓ List response includes full URL: ${foundReferral.url}\n`);

    // Step 4: Deactivate (Agent deactivates code)
    console.log("Step 4: Agent deactivating referral...");
    console.log(`  Action: POST /api/referrals/${TEST_CODE}/deactivate`);

    const deactivateResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/${TEST_CODE}/deactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "expired",
          notes: "Validation test",
        }),
      },
    );

    if (deactivateResponse.status !== 200) {
      throw new Error(
        `Deactivate failed with status ${deactivateResponse.status}`,
      );
    }

    const deactivateData = (await deactivateResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Validate: Deactivate response includes COMPLETE URL
    if (deactivateData.referral.url !== TEST_URL) {
      throw new Error(
        `FAIL: Deactivate response URL mismatch!\n` +
          `  Expected: ${TEST_URL}\n` +
          `  Got: ${deactivateData.referral.url}`,
      );
    }
    console.log(
      `  ✓ Deactivate response includes full URL: ${deactivateData.referral.url}\n`,
    );

    // Step 5: Reactivate (Agent reactivates code)
    console.log("Step 5: Agent reactivating referral...");
    console.log(`  Action: POST /api/referrals/${TEST_CODE}/reactivate`);

    const reactivateResponse = await proxy.env.DEALS_SOURCES.fetch(
      `${baseUrl}/api/referrals/${TEST_CODE}/reactivate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    if (reactivateResponse.status !== 200) {
      throw new Error(
        `Reactivate failed with status ${reactivateResponse.status}`,
      );
    }

    const reactivateData = (await reactivateResponse.json()) as {
      success: boolean;
      referral: ReferralInput;
    };

    // Validate: Reactivate response includes COMPLETE URL
    if (reactivateData.referral.url !== TEST_URL) {
      throw new Error(
        `FAIL: Reactivate response URL mismatch!\n` +
          `  Expected: ${TEST_URL}\n` +
          `  Got: ${reactivateData.referral.url}`,
      );
    }
    console.log(
      `  ✓ Reactivate response includes full URL: ${reactivateData.referral.url}\n`,
    );

    // Success
    console.log("========================================");
    console.log("✅ ALL TESTS PASSED");
    console.log("========================================");
    console.log("\nValidation Summary:");
    console.log("  ✓ Create returns full URL");
    console.log("  ✓ Get by code returns full URL");
    console.log("  ✓ List returns full URLs");
    console.log("  ✓ Deactivate returns full URL");
    console.log("  ✓ Reactivate returns full URL");
    console.log("\nThe system correctly preserves and returns");
    console.log("COMPLETE FULL URLs to all agents.");
    console.log(`\nTest URL: ${TEST_URL}`);
    console.log(`Code: ${TEST_CODE}`);
    console.log(`Domain: ${TEST_DOMAIN}`);
  } catch (error) {
    console.error("\n❌ VALIDATION FAILED");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await proxy.dispose();
  }
}

// Run validation
validateUrlPreservation();
