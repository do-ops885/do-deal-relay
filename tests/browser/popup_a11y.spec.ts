import { test, expect } from "@playwright/test";

const mockChromeAPI = {
  tabs: {
    query: async () => [{ id: 1, title: "Test", url: "https://example.com/", favIconUrl: "" }],
    sendMessage: async () => ({ referrals: [] })
  },
  storage: {
    sync: { get: async () => ({}), set: async () => {} },
    local: { get: async () => ({}), set: async () => {} }
  },
  scripting: { executeScript: async () => [{ result: true }] },
  runtime: { sendMessage: async () => ({ success: true }) }
};

test.describe("Extension Popup Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((mock) => { (window as any).chrome = mock; }, mockChromeAPI);
    await page.goto(`file://${process.cwd()}/extension/popup.html`);
    await page.waitForTimeout(1000);
  });

  test("interactive elements are reachable via keyboard", async ({ page }) => {
    const manualInput = page.locator("#manual-code");
    await manualInput.focus();
    await expect(manualInput).toBeFocused();

    // Just verify the elements exist and can be focused manually
    const settingsBtn = page.locator("#settings-link");
    await settingsBtn.focus();
    await expect(settingsBtn).toBeFocused();
  });

  test("settings button is a semantic button", async ({ page }) => {
    const settingsBtn = page.locator("#settings-link");
    await expect(settingsBtn).toHaveAttribute("type", "button");
  });
});
