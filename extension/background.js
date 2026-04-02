/**
 * Referral Capture - Background Service Worker
 *
 * Handles API communication, context menus, and cross-tab coordination.
 * CRITICAL: Always sends and receives COMPLETE URLs.
 */

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_API_BASE = "http://localhost:8787";

// ============================================================================
// Service Worker Class
// ============================================================================

class ExtensionService {
  constructor() {
    this.apiBaseUrl = DEFAULT_API_BASE;
    this.init();
  }

  async init() {
    // Load settings
    await this.loadSettings();

    // Setup all listeners
    this.setupContextMenus();
    this.setupCommandListener();
    this.setupMessageHandlers();
    this.setupTabListeners();

    console.log("Referral Capture extension initialized");
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["apiEndpoint"]);
      if (result.apiEndpoint) {
        this.apiBaseUrl = result.apiEndpoint;
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }

  // ============================================================================
  // Context Menu Integration
  // ============================================================================

  setupContextMenus() {
    // Remove existing menus to avoid duplicates
    chrome.contextMenus.removeAll(() => {
      // Main capture menu item
      chrome.contextMenus.create({
        id: "capture-referral",
        title: "🎁 Capture Referral Code",
        contexts: ["page", "selection", "link"],
      });

      // Selection-specific capture
      chrome.contextMenus.create({
        id: "capture-selection",
        title: "Capture Selection as Referral Code",
        contexts: ["selection"],
      });

      // Link capture
      chrome.contextMenus.create({
        id: "capture-link",
        title: "Capture Link Referral Code",
        contexts: ["link"],
      });
    });

    // Handle clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  async handleContextMenuClick(info, tab) {
    let code = null;
    let url = tab.url;
    let title = tab.title;

    if (info.menuItemId === "capture-selection" && info.selectionText) {
      // Clean up selection text
      code = info.selectionText.trim().toUpperCase();
      if (!this.isValidCode(code)) {
        this.showNotification(
          "Invalid Code",
          "Selected text does not appear to be a valid referral code.",
        );
        return;
      }
    } else if (info.menuItemId === "capture-link" && info.linkUrl) {
      // Extract code from link URL
      url = info.linkUrl;
      code = this.extractCodeFromUrl(url);
      if (!code) {
        this.showNotification(
          "No Code Found",
          "Could not detect a referral code in this link.",
        );
        return;
      }
    } else {
      // Page capture - use content script detection
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getDetections",
        });
        if (response && response.referrals && response.referrals.length > 0) {
          // Use the highest confidence detection
          const bestDetection = response.referrals.reduce((best, current) =>
            current.confidence > best.confidence ? current : best,
          );
          code = bestDetection.code;
        } else {
          this.showNotification(
            "No Codes Found",
            "No referral codes detected on this page.",
          );
          return;
        }
      } catch (error) {
        this.showNotification(
          "Error",
          "Could not scan page. Try using the popup instead.",
        );
        return;
      }
    }

    // Submit the referral
    try {
      const result = await this.submitToAPI({
        code: code,
        url: url, // CRITICAL: Complete URL preserved
        domain: new URL(url).hostname,
        title: title,
        source: "extension_context_menu",
        confidence: 0.9,
      });

      this.showNotification("Success!", `Captured referral code: ${code}`);
      this.updateBadge(tab.id, 1);
    } catch (error) {
      this.showNotification("Capture Failed", error.message);
    }
  }

  // ============================================================================
  // Keyboard Shortcut Handler
  // ============================================================================

  setupCommandListener() {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command === "quick-capture") {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab) {
          this.handleQuickCapture(tab);
        }
      }
    });
  }

  async handleQuickCapture(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getDetections",
      });

      if (response && response.referrals && response.referrals.length > 0) {
        const bestDetection = response.referrals.reduce((best, current) =>
          current.confidence > best.confidence ? current : best,
        );

        await this.submitToAPI({
          code: bestDetection.code,
          url: tab.url, // CRITICAL: Complete URL preserved
          domain: new URL(tab.url).hostname,
          title: tab.title,
          source: "extension_keyboard",
          confidence: bestDetection.confidence,
        });

        this.showNotification(
          "Quick Capture",
          `Captured: ${bestDetection.code}`,
        );
      } else {
        this.showNotification(
          "No Codes",
          "No referral codes found on this page",
        );
      }
    } catch (error) {
      this.showNotification("Error", "Could not capture from this page");
    }
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Handle async responses properly
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case "submitToAPI":
          const result = await this.submitToAPI(request.data);
          sendResponse(result);
          break;

        case "updateBadge":
          if (sender.tab) {
            this.updateBadge(sender.tab.id, request.count);
          }
          sendResponse({ success: true });
          break;

        case "getSettings":
          await this.loadSettings();
          sendResponse({ apiEndpoint: this.apiBaseUrl });
          break;

        case "updateSettings":
          if (request.apiEndpoint) {
            this.apiBaseUrl = request.apiEndpoint;
            await chrome.storage.sync.set({ apiEndpoint: this.apiBaseUrl });
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      console.error("Message handler error:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // ============================================================================
  // Tab Listeners
  // ============================================================================

  setupTabListeners() {
    // Clear badge when tab changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.action.setBadgeText({ text: "", tabId: activeInfo.tabId });
    });

    // Clear badge when navigating
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "loading") {
        chrome.action.setBadgeText({ text: "", tabId });
      }
    });
  }

  updateBadge(tabId, count) {
    if (count > 0) {
      chrome.action.setBadgeText({
        text: count > 99 ? "99+" : count.toString(),
        tabId,
      });
      chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
    }
  }

  // ============================================================================
  // API Integration
  // ============================================================================

  async submitToAPI(data) {
    // Build the payload according to API specification
    // CRITICAL: url field contains COMPLETE FULL URL
    const payload = {
      code: data.code,
      url: data.url, // COMPLETE URL: https://picnic.app/de/freunde-rabatt/DOMI6869
      domain: data.domain,
      source: data.source || "extension",
      submitted_by: data.submitted_by || "browser-extension",
      metadata: {
        title: data.title || "Unknown",
        reward_type: data.reward_type || "unknown",
        category: ["general"],
        confidence_score: data.confidence || 0.8,
        detection_source: data.source || "manual",
      },
    };

    console.log("Submitting to API with complete URL:", payload.url);

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-Version": "1.0.0",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle specific error cases
        if (response.status === 409) {
          throw new Error("This referral code already exists");
        } else if (response.status === 400) {
          throw new Error(errorData.message || "Invalid referral data");
        } else if (response.status === 500) {
          throw new Error("Server error. Please try again later.");
        } else {
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }
      }

      const result = await response.json();

      // Verify the response includes complete URL
      if (result.referral && result.referral.url) {
        console.log("API returned complete URL:", result.referral.url);
      }

      return { success: true, referral: result.referral };
    } catch (error) {
      console.error("API submission error:", error);
      throw error;
    }
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  isValidCode(code) {
    return (
      code && code.length >= 4 && code.length <= 20 && /^[A-Z0-9]+$/i.test(code)
    );
  }

  extractCodeFromUrl(url) {
    try {
      // Path patterns
      const pathMatch = url.match(
        /\/(?:invite|referral|ref|join|promo|freunde-rabatt|app)\/([A-Z0-9]{4,20})/i,
      );
      if (pathMatch) return pathMatch[1].toUpperCase();

      // Query parameters
      const urlObj = new URL(url);
      const paramKeys = ["ref", "referral", "invite", "rcode", "promo", "code"];

      for (const key of paramKeys) {
        const value = urlObj.searchParams.get(key);
        if (value && this.isValidCode(value)) {
          return value.toUpperCase();
        }
      }
    } catch (error) {
      // Invalid URL
    }

    return null;
  }

  showNotification(title, message) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: title,
        message: message,
      });
    } else {
      // Fallback for browsers without notification API
      console.log(`[Notification] ${title}: ${message}`);
    }
  }
}

// ============================================================================
// Initialize Service
// ============================================================================

const service = new ExtensionService();

// ============================================================================
// Service Worker Lifecycle
// ============================================================================

self.addEventListener("install", () => {
  console.log("Referral Capture service worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Referral Capture service worker activated");
  event.waitUntil(self.clients.claim());
});
