import { test, expect } from "@playwright/test";

/**
 * Accessibility and Keyboard Navigation Tests for Deal Discovery Browser Extension
 */

// Mock chrome API for testing
const mockChromeAPI = {
  tabs: {
    query: async () => [
      {
        id: 1,
        title: "Test Page",
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
    sendMessage: async () => ({ success: true }),
  },
  scripting: {
    executeScript: async () => [{ result: true }],
  },
};

test.describe("Extension Popup Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock chrome API before loading the popup
    await page.addInitScript((mock) => {
      (window as any).chrome = mock;
    }, mockChromeAPI);

    // Load the extension popup
    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    // Wait for async init in popup.js
    await page.waitForTimeout(500);
  });

  test("interactive elements are reachable via keyboard", async ({ page }) => {
    // Start at the top
    await page.keyboard.press("Tab");

    // First element should be manual input (since detections are hidden initially or loaded later)
    // Actually, depending on how it loads, let's just check if we can focus key elements

    const manualInput = page.locator("#manual-code");
    await manualInput.focus();
    await expect(manualInput).toBeFocused();

    await page.keyboard.press("Tab");
    const manualBtn = page.locator("#manual-btn");
    await expect(manualBtn).toBeFocused();

    await page.keyboard.press("Tab");
    const settingsBtn = page.locator("#settings-link");
    await expect(settingsBtn).toBeFocused();

    await page.keyboard.press("Tab");
    const refreshBtn = page.locator("#refresh-btn");
    await expect(refreshBtn).toBeFocused();
  });

  test("focus-visible styles are applied", async ({ page }) => {
    const manualBtn = page.locator("#manual-btn");

    // :focus-visible requires keyboard navigation; programmatic .focus() does
    // NOT trigger the pseudo-class (browser heuristic for input modality).
    // Tab through the page until manual-btn is the active element.
    await page.keyboard.press("Tab");
    let isFocused = await manualBtn.evaluate(
      (el) => document.activeElement === el,
    );
    let attempts = 0;
    while (!isFocused && attempts < 10) {
      await page.keyboard.press("Tab");
      isFocused = await manualBtn.evaluate(
        (el) => document.activeElement === el,
      );
      attempts++;
    }
    await expect(manualBtn).toBeFocused();

    // Check for focus-visible ring (always with keyboard modality)
    const boxReference = await manualBtn.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });
    expect(boxReference).toMatch(/rgb\(79, 70, 229\)|rgba\(79, 70, 229/);
  });

  test("settings button is a semantic button", async ({ page }) => {
    const settingsBtn = page.locator("#settings-link");
    const tagName = await settingsBtn.evaluate((el) => el.tagName);
    expect(tagName).toBe("BUTTON");

    const typeAttr = await settingsBtn.getAttribute("type");
    expect(typeAttr).toBe("button");
  });

  test("detection items are reachable and show focus ring", async ({
    page,
  }) => {
    // Ensure detections section is visible + add a deterministic detection item.
    await page.evaluate(() => {
      const detSection = document.getElementById("detections-section");
      if (detSection) detSection.style.display = "block";

      const detList = document.getElementById("detection-list");
      if (detList) {
        const btn = document.createElement("button");
        btn.className = "detection-item";
        btn.textContent = "MOCKCODE";
        detList.appendChild(btn);
      }
    });

    const detectionItem = page.locator(".detection-item").first();

    // Force keyboard modality so :focus-visible applies (programmatic .focus()
    // bypasses the heuristic and CSS box-shadow stays rgba(0,0,0,0)).
    // Tab from a stable prior focus target (capture button at top of popup).
    await page.locator("#capture-btn").focus();
    await page.keyboard.press("Tab"); // -> first detection-item if list is in tab order
    // Fallback: if Tab didn't land there, Tab more.
    for (let i = 0; i < 4; i++) {
      const isFocused = await detectionItem.evaluate(
        (el) => document.activeElement === el,
      );
      if (isFocused) break;
      await page.keyboard.press("Tab");
    }
    await expect(detectionItem).toBeFocused();

    const boxShadow = await detectionItem.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });
    expect(boxShadow).toMatch(/rgb\(79, 70, 229\)|rgba\(79, 70, 229/);
  });
});
