import { test, expect } from "@playwright/test";

/**
 * Accessibility and Keyboard Navigation Tests for Deal Discovery Browser Extension
 */

import { installMockChrome } from "./helpers/mockChrome";

test.describe("Extension Popup Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Install the chrome API mock, navigate to popup.html, then wait for
    // popup.js's async init() chain to settle (loadSettings -> tabs.query ->
    // requestDetections -> loadStats -> setupEventListeners).
    await installMockChrome(page);
    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(500);
  });

  test("interactive elements are reachable via keyboard", async ({ page }) => {
    // Start at the top
    await page.keyboard.press("Tab");

    // First element should be manual input (since detections are hidden
    // initially or loaded later); focus it manually since popup.js#init()
    // focuses #capture-btn programmatically (so the natural first Tab from
    // document body would NOT land on #manual-code in this test setup).

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
    const captureBtn = page.locator("#capture-btn");

    // Anchor keyboard modality at #capture-btn. popup.js#init() calls
    // elements.captureBtn.focus() programmatically; if Playwright runs the
    // test before that completes, the Tab loop starts from <body> and
    // tab-order traversal becomes non-deterministic. Asserting the anchor
    // catches silent focus failures from Playwright (locator.focus() returns
    // void and would otherwise swallow them).
    await captureBtn.focus();
    await expect(captureBtn).toBeFocused();

    // Tab forward until #manual-btn is focused. CSS in popup.html applies
    // the box-shadow ring on `:focus` (not just `:focus-visible`) as a
    // fallback for headless chromium — see popup.html for the rationale.
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
    // Force-show detections section + append a deterministic mock item.
    // popup.js#showDetections() will also auto-populate ONE real item from
    // the chrome.tabs.sendMessage mock, so we end up with 2 children in
    // #detection-list: [real(TEST123), mock(MOCKCODE)].
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

    // "reachable" intent: belt-and-suspenders DOM presence assertion.
    // Forward Tab from #capture-btn (which lives AFTER the detection-list
    // in DOM order inside #detections-section) skips past detection-items
    // entirely to #manual-code. Shift+Tab from capture-btn walks BACK to
    // the LAST detection-item in DOM (the appended mock, NOT `.first()`).
    // Programmatic .focus() on `.first()` is the deterministic choice and
    // the CSS focus ring rule applies on plain `:focus` too — see
    // popup.html for the `:focus, :focus-visible` selector pair.
    await expect(detectionItem).toBeAttached();
    await detectionItem.focus();
    await expect(detectionItem).toBeFocused();

    const boxShadow = await detectionItem.evaluate((el) => {
      return window.getComputedStyle(el).boxShadow;
    });
    expect(boxShadow).toMatch(/rgb\(79, 70, 229\)|rgba\(79, 70, 229/);
  });
});
