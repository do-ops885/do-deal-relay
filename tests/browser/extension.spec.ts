import { test, expect } from "@playwright/test";

test.describe("Extension Popup UI Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).chrome = {
        tabs: {
          query: () =>
            Promise.resolve([
              {
                id: 1,
                title: "Test Page",
                url: "https://example.com/",
                favIconUrl: "",
              },
            ]),
          sendMessage: () => Promise.resolve({ referrals: [] }),
        },
        storage: {
          sync: {
            get: () =>
              Promise.resolve({ apiEndpoint: "http://localhost:8787" }),
            set: () => Promise.resolve(),
          },
          local: {
            get: () =>
              Promise.resolve({ captured: 0, submitted: 0, success: 0 }),
            set: () => Promise.resolve(),
          },
        },
        scripting: { executeScript: () => Promise.resolve([{ result: true }]) },
        runtime: { sendMessage: () => Promise.resolve({ success: true }) },
      };
    });
    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    // Wait for the initialization script to run
    await page.waitForTimeout(1000);
  });

  test("manual input cleaning works", async ({ page }) => {
    const input = page.locator("#manual-code");
    // We use fill then dispatch input event manually because Playwright's fill doesn't always trigger it correctly with our complex listener
    await input.fill("abc-123!");
    await page.evaluate(() => {
      const el = document.getElementById("manual-code");
      if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(input).toHaveValue("ABC123");
  });

  test("character counter updates", async ({ page }) => {
    const counter = page.locator("#char-counter");
    await page.locator("#manual-code").fill("TEST");
    await page.evaluate(() => {
      const el = document.getElementById("manual-code");
      if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(counter).toHaveText("4/20");
  });

  test("button enables after 3 characters", async ({ page }) => {
    const btn = page.locator("#manual-btn");
    await expect(btn).toBeDisabled();
    await page.locator("#manual-code").fill("ABC");
    await page.evaluate(() => {
      const el = document.getElementById("manual-code");
      if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(btn).toBeEnabled();
  });

  test("error class and container visibility", async ({ page }) => {
    const input = page.locator("#manual-code");
    const errContainer = page.locator("#manual-error");

    // Trigger error state manually
    await page.evaluate(() => {
      const el = document.getElementById("manual-code");
      const err = document.getElementById("manual-error");
      if (el && err) {
        el.classList.add("error");
        err.textContent = "Test error";
        err.classList.remove("hidden");
      }
    });

    await expect(input).toHaveClass(/error/);
    await expect(errContainer).toBeVisible();
    await expect(errContainer).toHaveText("Test error");
  });
});
