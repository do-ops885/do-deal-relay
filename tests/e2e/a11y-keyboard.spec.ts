import { test, expect } from "@playwright/test";

test.describe("Extension A11y Tests", () => {
  test.beforeEach(async ({ page }) => {
    // page.on("console", (msg) => console.log(`PAGE LOG: ${msg.text()}`));
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: (queryInfo: any, callback: any) => {
            const tabs = [
              { id: 1, title: "Test Page", url: "https://example.com" },
            ];
            if (callback) callback(tabs);
            return Promise.resolve(tabs);
          },
          sendMessage: (
            tabId: number,
            message: any,
            options: any,
            callback: any,
          ) => {
            const response = {
              referrals: [
                { code: "PROMO1", source: "url", confidence: 0.9 },
                { code: "PROMO2", source: "content", confidence: 0.8 },
              ],
            };
            if (typeof options === "function") callback = options;
            if (callback) callback(response);
            return Promise.resolve(response);
          },
        },
        storage: {
          sync: {
            get: (keys: any, callback: any) => {
              const res = { apiEndpoint: "http://localhost:8787" };
              if (callback) callback(res);
              return Promise.resolve(res);
            },
            set: (items: any, callback: any) => {
              if (callback) callback();
              return Promise.resolve();
            },
          },
          local: {
            get: (keys: any, callback: any) => {
              const res = { captured: 0, submitted: 0, success: 0 };
              if (callback) callback(res);
              return Promise.resolve(res);
            },
            set: (items: any, callback: any) => {
              if (callback) callback();
              return Promise.resolve();
            },
          },
        },
        scripting: {
          executeScript: (details: any, callback: any) => {
            const res = [{ result: true }];
            if (callback) callback(res);
            return Promise.resolve(res);
          },
        },
        runtime: {
          sendMessage: (message: any, callback: any) => {
            const res = { success: true };
            if (callback) callback(res);
            return Promise.resolve(res);
          },
          lastError: null,
        },
      };
    });

    await page.goto(`file://${process.cwd()}/extension/popup.html`);
  });

  test("detection items are buttons and focusable", async ({ page }) => {
    await page.waitForSelector(".detection-item");

    const items = page.locator(".detection-item");
    const firstItem = items.first();

    const tagName = await firstItem.evaluate((el) => el.tagName);
    expect(tagName).toBe("BUTTON");

    let found = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      const activeClass = await page.evaluate(
        () => document.activeElement?.className,
      );
      if (activeClass?.includes("detection-item")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("detection items can be selected via keyboard", async ({ page }) => {
    await page.waitForSelector(".detection-item");

    const secondItem = page.locator(".detection-item").nth(1);
    await secondItem.focus();
    await page.keyboard.press("Enter");

    await expect(secondItem).toHaveClass(/selected/);
    await expect(secondItem).toHaveAttribute("aria-pressed", "true");

    const firstItem = page.locator(".detection-item").first();
    await expect(firstItem).not.toHaveClass(/selected/);
    await expect(firstItem).toHaveAttribute("aria-pressed", "false");
  });
});
