import { test, expect } from "@playwright/test";

/**
 * Accessibility and Interaction Tests for Deal Discovery Browser Extension
 */

test.describe("Extension Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => console.log(`PAGE LOG: ${msg.text()}`));

    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: async (queryInfo) => {
            return [
              {
                id: 1,
                title: "Test Page",
                url: "https://example.com/referral/TEST123",
                favIconUrl: null,
              },
            ];
          },
          sendMessage: async (tabId, message, options) => {
            return {
              referrals: [
                {
                  code: "TEST123",
                  confidence: 0.95,
                  source: "url_path",
                },
                {
                  code: "PROMO456",
                  confidence: 0.8,
                  source: "text_pattern",
                },
              ],
              pageTitle: "Test Page",
              pageUrl: "https://example.com/referral/TEST123",
            };
          },
        },
        storage: {
          sync: {
            get: async (keys) => {
              return { apiEndpoint: "http://localhost:8787" };
            },
            set: async (data) => {},
          },
          local: {
            get: async (keys) => {
              const result: any = {};
              if (Array.isArray(keys)) {
                keys.forEach((key) => (result[key] = 0));
              } else if (typeof keys === "string") {
                result[keys] = 0;
              }
              return result;
            },
            set: async (data) => {},
          },
        },
        runtime: {
          onMessage: {
            addListener: () => {},
            removeListener: () => {},
            hasListener: () => false,
          },
          sendMessage: async (message) => {
            return { success: true };
          },
          lastError: null,
        },
        scripting: {
          executeScript: async (args) => {
            return [{ result: true }];
          },
        },
        action: {
          setBadgeText: () => {},
          setBadgeBackgroundColor: () => {},
        },
      };
      console.log("Direct Mock Chrome API injected");
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
  });

  test("decorative emojis are hidden from screen readers", async ({ page }) => {
    await expect(page.locator("h1 span[aria-hidden='true']")).toHaveText("🎁");
    await expect(
      page.locator("#refresh-btn span[aria-hidden='true']"),
    ).toHaveText("🔄");
  });

  test("refresh button has accessible label", async ({ page }) => {
    const refreshBtn = page.locator("#refresh-btn");
    await expect(refreshBtn).toHaveAttribute("aria-label", "Rescan page");
  });

  test("manual input has associated label", async ({ page }) => {
    const label = page.locator("label[for='manual-code']");
    await expect(label).toBeAttached();
    await expect(label).toHaveClass(/hidden/);
    await expect(label).toHaveText("Referral Code");
  });

  test("favicon has fallback ARIA role and label when no icon is present", async ({
    page,
  }) => {
    const favicon = page.locator("#favicon");
    await expect(favicon).toHaveAttribute("role", "img", { timeout: 15000 });
    await expect(favicon).toHaveAttribute("aria-label", "Website icon");
  });

  test("detection items are keyboard accessible", async ({ page }) => {
    const firstItem = page.locator(".detection-item").first();
    await expect(firstItem).toBeVisible({ timeout: 15000 });

    const secondItem = page.locator(".detection-item").nth(1);

    await expect(firstItem).toHaveAttribute("role", "button");
    await expect(firstItem).toHaveAttribute("tabindex", "0");
    await expect(firstItem).toHaveAttribute("aria-selected", "true");

    await secondItem.focus();
    await page.keyboard.press("Enter");
    await expect(secondItem).toHaveClass(/selected/);
    await expect(secondItem).toHaveAttribute("aria-selected", "true");
    await expect(firstItem).not.toHaveClass(/selected/);
    await expect(firstItem).toHaveAttribute("aria-selected", "false");

    await firstItem.focus();
    await page.keyboard.press(" ");
    await expect(firstItem).toHaveClass(/selected/);
    await expect(firstItem).toHaveAttribute("aria-selected", "true");
  });
});
