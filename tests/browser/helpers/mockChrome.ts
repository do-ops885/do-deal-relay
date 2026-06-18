import type { Page } from "@playwright/test";

/**
 * Install the chrome API mock as an init script for an E2E test page.
 *
 * CRITICAL: the chrome mock MUST be defined *inside* the `addInitScript`
 * callback below. Passing the mock as the second `arg` parameter would
 * trigger Playwright's Node->browser serialization (JSON), which silently
 * strips every function. With functions stripped, `chrome.tabs.query`,
 * `chrome.tabs.sendMessage`, `chrome.runtime.sendMessage`, etc. all become
 * `undefined`, popup.js's init() chain throws on the very first call, the
 * `.catch(console.error)` swallows the error, and DOM assertions that
 * depend on the post-hydration state (`#page-title` populated, detection
 * items rendered, settings panel toggleable) time out at the 5s default.
 *
 * Defining the object literal inline keeps the arrow functions as actual
 * functions because no serialization boundary is crossed.
 *
 * The mock returns data shaped to match what popup.js actually consumes:
 * - `tabs.query` -> first tab with title, url, favIconUrl (used by updatePageInfo).
 * - `tabs.sendMessage` (action: "getDetections") -> referrals array consumed
 *   by showDetections (only `code`, `source`, `confidence` fields).
 * - `scripting.executeScript` -> ["detector loaded"] sentinel so the second
 *   injection path (which would inject content.js into a real page) is skipped.
 * - `storage.sync.get` -> api endpoint URL (consumed by loadSettings).
 * - `storage.local.get` -> non-zero counters (consumed by loadStats).
 * - `runtime.sendMessage` (action: "submitToAPI") -> success sentinel
 *   (consumed by submitReferral).
 */
export async function installMockChrome(page: Page): Promise<void> {
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
          referrals: [
            {
              code: "TEST123",
              source: "url",
              confidence: 0.95,
            },
          ],
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
      scripting: {
        executeScript: async () => [{ result: true }],
      },
      runtime: {
        sendMessage: async () => ({ success: true }),
      },
    };
  });
}
