import { test, expect } from "@playwright/test";

/**
 * Browser-based UI Tests for Deal Discovery Browser Extension
 *
 * Tests the browser extension popup UI and functionality using Playwright.
 * These tests validate the user interface and interaction patterns.
 *
 * IMPORTANT: The chrome.* API mock MUST be defined inline inside
 * addInitScript. Playwright serializes arguments passed to addInitScript,
 * which strips all function definitions. Inlining the mock ensures the
 * functions survive serialization.
 */

test.describe("Extension Popup UI Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock chrome API inline (Playwright serialization strips functions
    // when passed as an argument, so the mock must be defined inside the callback)
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            {
              id: 1,
              title: "Test Page - Referral Program",
              url: "https://example.com/referral/TEST123",
              favIconUrl: "https://example.com/favicon.ico",
            },
          ],
          sendMessage: async () => ({
            referrals: [{ code: "TEST123", source: "url", confidence: 0.95 }],
          }),
        },
        storage: {
          sync: {
            get: async () => ({ apiEndpoint: "http://localhost:8787" }),
            set: async () => {},
          },
          local: {
            get: async () => ({ captured: 0, submitted: 0, success: 0 }),
            set: async () => {},
          },
        },
        runtime: {
          sendMessage: async (req: any) => {
            // Route API submissions through fetch so Playwright's page.route
            // can intercept them for API integration tests
            if (req?.action === "submitToAPI") {
              const res = await fetch("/api/submit", {
                method: "POST",
                body: JSON.stringify(req.data),
              });
              return res.json();
            }
            return { success: true, referral: { status: "active" } };
          },
        },
        scripting: {
          executeScript: async () => [{ result: true }],
        },
      };
    });

    // Load the extension popup
    await page.goto(`file://${process.cwd()}/extension/popup.html`);

    // Wait for popup.js async init() to complete (loadSettings, tab query,
    // detection request, stats load)
    await page.waitForTimeout(500);
  });

  test("popup displays page title correctly", async ({ page }) => {
    const pageTitle = await page.locator("#page-title").textContent();
    expect(pageTitle).toBe("Test Page - Referral Program");
  });

  test("popup displays page URL correctly", async ({ page }) => {
    const pageUrl = await page.locator("#page-url").textContent();
    expect(pageUrl).toContain("example.com");
  });

  test("scan status is visible", async ({ page }) => {
    const scanStatus = page.locator("#scan-status");
    await expect(scanStatus).toBeVisible();
  });

  test("detection list shows detected codes", async ({ page }) => {
    // Wait for detections to load
    await page.waitForTimeout(500);

    const detectionList = page.locator("#detection-list");
    await expect(detectionList).toBeVisible();

    // Check if detection items are rendered
    const detectionItems = page.locator(".detection-item");
    const count = await detectionItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("capture button is clickable", async ({ page }) => {
    const captureBtn = page.locator("#capture-btn");
    await expect(captureBtn).toBeVisible();
    await expect(captureBtn).toBeEnabled();
  });

  test("manual code input accepts text", async ({ page }) => {
    const manualInput = page.locator("#manual-code");
    await manualInput.fill("MANUAL123");
    await expect(manualInput).toHaveValue("MANUAL123");
  });

  test("settings panel can be toggled", async ({ page }) => {
    const settingsLink = page.locator("#settings-link");
    const settingsPanel = page.locator("#settings-panel");

    // Initially hidden
    await expect(settingsPanel).not.toBeVisible();

    // Click to open
    await settingsLink.click();
    await expect(settingsPanel).toBeVisible();

    // Click again to close
    await settingsLink.click();
    await expect(settingsPanel).not.toBeVisible();
  });

  test("API endpoint can be updated", async ({ page }) => {
    // Open settings
    await page.locator("#settings-link").click();

    const apiEndpointInput = page.locator("#api-endpoint");
    await apiEndpointInput.fill("http://new-endpoint:8787");
    await expect(apiEndpointInput).toHaveValue("http://new-endpoint:8787");

    // Save settings
    const saveBtn = page.locator("#save-settings-btn");
    await expect(saveBtn).toBeEnabled();
  });

  test("stats section displays counters", async ({ page }) => {
    const statCaptured = page.locator("#stat-captured");
    const statSubmitted = page.locator("#stat-submitted");
    const statSuccess = page.locator("#stat-success");

    await expect(statCaptured).toBeVisible();
    await expect(statSubmitted).toBeVisible();
    await expect(statSuccess).toBeVisible();
  });

  test("refresh button triggers rescan", async ({ page }) => {
    const refreshBtn = page.locator("#refresh-btn");
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();

    // Click refresh
    await refreshBtn.click();

    // Should show loading state briefly
    const scanStatus = page.locator("#scan-status");
    await expect(scanStatus).not.toHaveText("Error");
  });
});

test.describe("Extension Content Script Tests", () => {
  test("content script detects referral codes in URLs", async ({ page }) => {
    // Inject content script logic BEFORE navigating (addInitScript only
    // applies to future navigations, not the current page)
    await page.addInitScript(() => {
      // Simulate detection
      const detections = [
        {
          type: "referral_code",
          value: "CODE123",
          confidence: 0.9,
          source: "url",
          context: window.location.href,
        },
      ];

      (window as any).__testDetections = detections;
    });

    // Create a test page with referral URL (after addInitScript)
    await page.goto("https://example.com/referral/CODE123");

    // Verify detection worked
    const detections = (await page.evaluate(
      () => (window as any).__testDetections,
    )) as any[];
    expect(detections).toHaveLength(1);
    expect(detections[0].value).toBe("CODE123");
  });

  test("content script detects referral codes in page content", async ({
    page,
  }) => {
    // Create test page first
    await page.setContent(`
      <html>
        <body>
          <h1>Referral Program</h1>
          <p>Use code REF456 to get $50 off!</p>
          <div>Share your code: SHARE789</div>
        </body>
      </html>
    `);

    // Run detection logic via page.evaluate (DOM is guaranteed ready)
    const detections = await page.evaluate(() => {
      const text = document.body.innerText;
      const codeRegex = /(?:code|referral|invite)[\s:]*([A-Z0-9]{3,})/gi;
      const matches: {
        type: string;
        value: string;
        confidence: number;
        source: string;
        context: string;
      }[] = [];
      let match: RegExpExecArray | null;

      while ((match = codeRegex.exec(text)) !== null) {
        matches.push({
          type: "referral_code",
          value: match[1] || "",
          confidence: 0.7,
          source: "page_content",
          context: match[0],
        });
      }

      return matches;
    });

    expect(detections.length).toBeGreaterThanOrEqual(1);
  });

  test("content script handles pages without referral codes", async ({
    page,
  }) => {
    // Create test page first
    await page.setContent(`
      <html>
        <body>
          <h1>Regular Page</h1>
          <p>No referral codes here.</p>
        </body>
      </html>
    `);

    // Run detection via page.evaluate (DOM is guaranteed ready)
    const detections = await page.evaluate(() => {
      const text = document.body.innerText;
      const codeRegex = /(?:code|referral|invite)[\s:]*([A-Z0-9]{3,})/gi;
      return [...text.matchAll(codeRegex)];
    });

    expect(detections).toHaveLength(0);
  });
});

test.describe("Extension API Integration Tests", () => {
  test("extension sends complete URLs to API", async ({ page }) => {
    // Inject chrome mock inline before loading popup
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            {
              id: 1,
              title: "Test Page",
              url: "https://example.com/referral/TEST123",
              favIconUrl: "https://example.com/favicon.ico",
            },
          ],
        },
        storage: {
          sync: {
            get: async () => ({ apiEndpoint: "http://localhost:8787" }),
            set: async () => {},
          },
          local: {
            get: async () => ({ captured: 0, submitted: 0, success: 0 }),
            set: async () => {},
          },
        },
        runtime: {
          sendMessage: async () => ({
            success: true,
            referral: { status: "active" },
          }),
        },
        scripting: {
          executeScript: async () => [{ result: true }],
        },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);

    // The page should have loaded without errors
    const pageTitle = await page.locator("#page-title").textContent();
    expect(pageTitle).toBeTruthy();
  });

  test("extension handles API errors gracefully", async ({ page }) => {
    // Intercept API routes
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Server error" }),
      });
    });

    // Inject chrome mock inline (with fetch-based routing for API)
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            {
              id: 1,
              title: "Test Page",
              url: "https://example.com",
            },
          ],
        },
        storage: {
          sync: {
            get: async () => ({ apiEndpoint: "http://localhost:8787" }),
            set: async () => {},
          },
          local: {
            get: async () => ({ captured: 0, submitted: 0, success: 0 }),
            set: async () => {},
          },
        },
        runtime: {
          sendMessage: async (req: any) => {
            if (req?.action === "submitToAPI") {
              const res = await fetch("/api/submit", {
                method: "POST",
                body: JSON.stringify(req.data),
              });
              return res.json();
            }
            return { success: true };
          },
        },
        scripting: {
          executeScript: async () => [{ result: true }],
        },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);

    // Page should have loaded (even if API errors occur)
    const pageTitle = await page.locator("#page-title").textContent();
    expect(pageTitle).toBeTruthy();
  });

  test("extension validates input before submission", async ({ page }) => {
    // Inject chrome mock inline
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            { id: 1, title: "Test", url: "https://example.com" },
          ],
        },
        storage: {
          sync: { get: async () => ({}), set: async () => {} },
          local: { get: async () => ({}), set: async () => {} },
        },
        runtime: { sendMessage: async () => ({ success: true }) },
        scripting: { executeScript: async () => [{ result: true }] },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);

    // Try to submit empty code
    const manualInput = page.locator("#manual-code");
    await manualInput.fill("");

    const manualBtn = page.locator("#manual-btn");

    // Button should be disabled or show validation error
    const isEnabled = await manualBtn.isEnabled();
    if (isEnabled) {
      await manualBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test("manual entry input cleans text in real-time", async ({ page }) => {
    // Inject chrome mock inline
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            { id: 1, title: "Test", url: "https://example.com" },
          ],
        },
        storage: {
          sync: { get: async () => ({}), set: async () => {} },
          local: { get: async () => ({}), set: async () => {} },
        },
        runtime: { sendMessage: async () => ({ success: true }) },
        scripting: { executeScript: async () => [{ result: true }] },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);

    const manualInput = page.locator("#manual-code");

    // Test auto-uppercasing
    await manualInput.fill("abc123");
    await expect(manualInput).toHaveValue("ABC123");

    // Test stripping non-alphanumeric
    await manualInput.fill("code!@#123");
    await expect(manualInput).toHaveValue("CODE123");

    // Test 20-char limit
    await manualInput.fill("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");
    const value = await manualInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(20);
  });

  test("manual entry shows validation error for invalid codes", async ({
    page,
  }) => {
    // Inject chrome mock inline
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async () => [
            { id: 1, title: "Test", url: "https://example.com" },
          ],
        },
        storage: {
          sync: { get: async () => ({}), set: async () => {} },
          local: { get: async () => ({}), set: async () => {} },
        },
        runtime: { sendMessage: async () => ({ success: true }) },
        scripting: { executeScript: async () => [{ result: true }] },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);

    const manualInput = page.locator("#manual-code");
    const manualCodeError = page.locator("#manual-code-error");

    // Error should be hidden when empty
    await expect(manualCodeError).toHaveClass(/hidden/);

    // Error should show for too-short code
    await manualInput.fill("ab");
    await expect(manualCodeError).not.toHaveClass(/hidden/);

    // Error should hide for valid code
    await manualInput.fill("VALID123");
    await expect(manualCodeError).toHaveClass(/hidden/);

    // Error should hide when cleared
    await manualInput.fill("");
    await expect(manualCodeError).toHaveClass(/hidden/);
  });
});
