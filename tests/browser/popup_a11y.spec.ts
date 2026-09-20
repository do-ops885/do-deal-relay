import { test, expect } from "@playwright/test";

/**
 * Accessibility and Keyboard Navigation Tests for Deal Discovery Browser Extension
 *
 * IMPORTANT: The chrome.* API mock MUST be defined inline inside
 * addInitScript. Playwright serializes arguments passed to addInitScript,
 * which strips all function definitions. Inlining the mock ensures the
 * functions survive serialization.
 */

test.describe("Extension Popup Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock chrome API inline (Playwright serialization strips functions
    // when passed as an argument, so the mock must be defined inside the callback)
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
    });

    // Load the extension popup
    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    // Wait for init() to complete deterministically: scan-status stops
    // showing 'scanning' when requestDetections() finishes, which runs
    // right before setupEventListeners() in popup.js init().
    await expect(
      page.locator("#scan-status .status-indicator"),
    ).not.toHaveClass(/scanning/, { timeout: 5000 });
  });

  test("interactive elements are reachable via keyboard", async ({ page }) => {
    // #manual-btn starts disabled until a valid code is typed. Pressing
    // Tab from #manual-code moves focus forward to #manual-btn (if
    // enabled), not back to the input.
    const manualInput = page.locator("#manual-code");
    await manualInput.focus();
    await manualInput.fill("VALID1234");
    await expect(manualInput).toHaveValue("VALID1234");

    // Tab from #manual-code moves to #manual-btn (next in DOM order)
    await page.keyboard.press("Tab");
    const manualBtn = page.locator("#manual-btn");
    await expect(manualBtn).toBeFocused();

    // Tab from #manual-btn moves to #copy-manual-btn
    await page.keyboard.press("Tab");
    const copyManualBtn = page.locator("#copy-manual-btn");
    await expect(copyManualBtn).toBeFocused();

    // Tab from #copy-manual-btn moves to #settings-link
    await page.keyboard.press("Tab");
    const settingsBtn = page.locator("#settings-link");
    await expect(settingsBtn).toBeFocused();

    // Tab from #settings-link moves to #refresh-btn
    await page.keyboard.press("Tab");
    const refreshBtn = page.locator("#refresh-btn");
    await expect(refreshBtn).toBeFocused();
  });

  test("focus-visible styles are applied", async ({ page }) => {
    const manualBtn = page.locator("#manual-btn");
    const manualInput = page.locator("#manual-code");

    // Pre-condition: #manual-btn starts disabled, so Tab skips it. Fill
    // a valid manual code first to enable it (popup.js input handler
    // uppercases + strips non-alphanumerics via the `input` event).
    await manualInput.focus();
    await manualInput.fill("VALID1234");
    await expect(manualBtn).toBeEnabled();

    // Tab until #manual-btn is keyboard-focused. Only keyboard-induced
    // focus triggers :focus-visible (programmatic .focus() does NOT,
    // per CSS Selectors Level 4 / browser spec).
    await page.keyboard.press("Tab");
    await expect(manualBtn).toBeFocused();

    // Verify focus indication is present. :focus-visible is a browser
    // heuristic that may not trigger in headless CI; accept any visible
    // focus indicator (box-shadow from :focus-visible, or outline from
    // default :focus). The critical assertion is that the element IS
    // keyboard-focused and reachable.
    await manualBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const isFocused = el.matches(":focus-visible");
      return {
        boxShadow: style.boxShadow,
        isFocusVisible: isFocused,
      };
    });

    // CI workaround: headful/headless heuristics for :focus-visible vary.
    // Ensure styles are checked if the element is keyboard focused.
    const isKeyboardFocused = await manualBtn.evaluate(
      (el) => document.activeElement === el,
    );

    if (isKeyboardFocused) {
      // In CI, we might need to wait for CSS transitions or rendering.
      // Use toPass to allow for flaky UI state in headless environments.
      await expect(async () => {
        const style = await manualBtn.evaluate((el) => {
          return window.getComputedStyle(el).boxShadow;
        });
        expect(style).toMatch(/rgb\(79, 70, 229\)|rgba\(79, 70, 229/);
      }).toPass({ timeout: 2000 });
    }
    // If :focus-visible heuristic didn't fire (common in headless CI),
    // the element is still keyboard-focused — that's sufficient proof
    // of keyboard reachability.
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
    // Ensure detections section is visible + inject a mock detection item.
    // The element is a <button> with class .detection-item, placed in the
    // DOM inside #detections-section.
    await page.evaluate(() => {
      const detSection = document.getElementById("detections-section");
      if (detSection) detSection.style.display = "block";

      const detList = document.getElementById("detection-list");
      if (detList) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "detection-item";
        btn.textContent = "MOCKCODE";
        detList.appendChild(btn);
      }
    });

    const detectionItem = page.locator(".detection-item").first();

    // Programmatic .focus() does NOT trigger :focus-visible (only keyboard
    // focus does). Walk Tab forward a few times until the detection item is
    // keyboard-focused (its position in tab order is at end-of-document,
    // after #refresh-btn).
    let isFocused = false;
    for (let i = 0; i < 10 && !isFocused; i++) {
      await page.keyboard.press("Tab");
      isFocused = await detectionItem.evaluate(
        (el) => document.activeElement === el,
      );
    }
    expect(isFocused).toBe(true);

    // Verify focus indication when :focus-visible heuristic fires.
    // Headless CI may not trigger :focus-visible; only assert styles
    // when the heuristic actually matched.
    await detectionItem.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        boxShadow: style.boxShadow,
        isFocusVisible: el.matches(":focus-visible"),
      };
    });

    // CI workaround: headful/headless heuristics for :focus-visible vary.
    // Ensure styles are checked if the element is keyboard focused.
    const isKeyboardFocused = await detectionItem.evaluate(
      (el) => document.activeElement === el,
    );

    if (isKeyboardFocused) {
      // In CI, we might need to wait for CSS transitions or rendering.
      // Use toPass to allow for flaky UI state in headless environments.
      await expect(async () => {
        const style = await detectionItem.evaluate((el) => {
          return window.getComputedStyle(el).boxShadow;
        });
        expect(style).toMatch(/rgb\(79, 70, 229\)|rgba\(79, 70, 229/);
      }).toPass({ timeout: 2000 });
    }
  });
});
