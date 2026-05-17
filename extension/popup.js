/**
 * Referral Capture - Popup Logic
 *
 * Handles the extension popup UI and API communication.
 * CRITICAL: Always sends COMPLETE URLs to the API.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // ============================================================================
  // State Management
  // ============================================================================

  const state = {
    currentTab: null,
    detections: [],
    selectedDetection: null,
    settings: {
      apiEndpoint: "http://localhost:8787", // Default local dev endpoint
    },
  };

  const SUPPORTED_CATEGORIES = [
    "Finance",
    "Shopping",
    "Travel",
    "Food Delivery",
    "Transportation",
    "Entertainment",
    "Health",
    "Education",
    "Software",
    "Cloud Storage",
    "Communication",
  ];

  const DOMAIN_CATEGORY_MAP = {
    "trading212.com": "Finance",
    "robinhood.com": "Finance",
    "coinbase.com": "Finance",
    "amazon.com": "Shopping",
    "ebay.com": "Shopping",
    "airbnb.com": "Travel",
    "booking.com": "Travel",
    "doordash.com": "Food Delivery",
    "ubereats.com": "Food Delivery",
    "uber.com": "Transportation",
    "lyft.com": "Transportation",
    "netflix.com": "Entertainment",
    "spotify.com": "Entertainment",
  };

  // ============================================================================
  // DOM Element References
  // ============================================================================

  const elements = {
    pageTitle: document.getElementById("page-title"),
    pageUrl: document.getElementById("page-url"),
    favicon: document.getElementById("favicon"),
    scanStatus: document.getElementById("scan-status"),
    detectionsSection: document.getElementById("detections-section"),
    detectionList: document.getElementById("detection-list"),
    captureBtn: document.getElementById("capture-btn"),
    manualSection: document.getElementById("manual-section"),
    manualCode: document.getElementById("manual-code"),
    manualCategory: document.getElementById("manual-category"),
    manualBtn: document.getElementById("manual-btn"),
    manualError: document.getElementById("manual-error"),
    charCounter: document.getElementById("char-counter"),
    categoryList: document.getElementById("category-list"),
    settingsPanel: document.getElementById("settings-panel"),
    settingsLink: document.getElementById("settings-link"),
    apiEndpoint: document.getElementById("api-endpoint"),
    saveSettingsBtn: document.getElementById("save-settings-btn"),
    refreshBtn: document.getElementById("refresh-btn"),
    toast: document.getElementById("toast"),
    statCaptured: document.getElementById("stat-captured"),
    statSubmitted: document.getElementById("stat-submitted"),
    statSuccess: document.getElementById("stat-success"),
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  async function init() {
    // Load settings
    await loadSettings();

    // Get current tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    state.currentTab = tab;

    // Update page info
    updatePageInfo(tab);

    // Populate categories
    populateCategories();

    // Suggest category
    suggestCategory(tab);

    // Request detections from content script
    await requestDetections(tab);

    // Load stats
    loadStats();

    // Setup event listeners
    setupEventListeners();
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  async function loadSettings() {
    const result = await chrome.storage.sync.get(["apiEndpoint"]);
    if (result.apiEndpoint) {
      state.settings.apiEndpoint = result.apiEndpoint;
    }
    elements.apiEndpoint.value = state.settings.apiEndpoint;
  }

  async function saveSettings() {
    const endpoint = elements.apiEndpoint.value.trim();
    if (!endpoint) {
      showToast("Please enter a valid API endpoint", "error");
      return;
    }

    state.settings.apiEndpoint = endpoint;
    await chrome.storage.sync.set({ apiEndpoint: endpoint });
    showToast("Settings saved!", "success");
    toggleSettings();
  }

  // ============================================================================
  // Page Information
  // ============================================================================

  function updatePageInfo(tab) {
    elements.pageTitle.textContent = tab.title || "Unknown";

    // Show hostname in a readable format
    try {
      const url = new URL(tab.url);
      elements.pageUrl.textContent = url.hostname;
    } catch {
      elements.pageUrl.textContent = "Invalid URL";
    }

    // Try to get favicon - using DOM API to prevent XSS
    if (tab.favIconUrl) {
      // Validate URL before using
      try {
        const faviconUrl = new URL(tab.favIconUrl);
        // Only allow http and https protocols
        if (
          faviconUrl.protocol === "http:" ||
          faviconUrl.protocol === "https:"
        ) {
          const img = document.createElement("img");
          img.src = faviconUrl.href;
          img.width = 32;
          img.height = 32;
          img.style.borderRadius = "6px";
          img.alt = ""; // Decorative image
          elements.favicon.textContent = "";
          elements.favicon.appendChild(img);
        } else {
          elements.favicon.textContent = "🌐";
        }
      } catch {
        elements.favicon.textContent = "🌐";
      }
    } else {
      elements.favicon.textContent = "🌐";
    }
  }

  // ============================================================================
  // Detection Handling
  // ============================================================================

  async function requestDetections(tab) {
    // Update status to scanning
    updateScanStatus("scanning", "Scanning for referral codes...");

    try {
      // Check if content script is loaded
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Check if detector exists
          return typeof window.__referralDetector !== "undefined";
        },
      });

      const isDetectorLoaded = results?.[0]?.result;

      if (!isDetectorLoaded) {
        // Inject content script if not loaded
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });

        // Wait a moment for script to initialize
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Now request detections
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getDetections",
      });

      if (response && response.referrals && response.referrals.length > 0) {
        state.detections = response.referrals;
        showDetections(response.referrals);
      } else {
        showNoDetections();
      }
    } catch (error) {
      console.error("Error getting detections:", error);
      showNoDetections();
    }
  }

  function showDetections(detections) {
    elements.detectionsSection.style.display = "block";
    updateScanStatus(
      "found",
      `${detections.length} referral code${detections.length > 1 ? "s" : ""} found`,
    );

    // Clear existing content
    elements.detectionList.textContent = "";

    // Build detection items using DOM API to prevent XSS
    detections.forEach((d, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "detection-item";
      item.dataset.index = i.toString();
      item.setAttribute("aria-pressed", i === 0 ? "true" : "false");

      const info = document.createElement("div");
      info.className = "detection-info";

      const codeValue = document.createElement("span");
      codeValue.className = "code-value";
      codeValue.textContent = d.code;

      const codeSource = document.createElement("span");
      codeSource.className = "code-source";
      codeSource.textContent = d.source.replace("_", " ");

      info.appendChild(codeValue);
      info.appendChild(codeSource);

      const confidence = document.createElement("span");
      confidence.className = "confidence";
      confidence.textContent = `${Math.round(d.confidence * 100)}%`;

      item.appendChild(info);
      item.appendChild(confidence);

      // Selection handling
      item.addEventListener("click", () => {
        elements.detectionList
          .querySelectorAll(".detection-item")
          .forEach((el) => {
            el.classList.remove("selected");
            el.setAttribute("aria-pressed", "false");
          });
        item.classList.add("selected");
        item.setAttribute("aria-pressed", "true");
        state.selectedDetection =
          state.detections[parseInt(item.dataset.index)];
      });

      elements.detectionList.appendChild(item);
    });

    // Auto-select first detection
    if (detections.length > 0) {
      const firstItem = elements.detectionList.querySelector(".detection-item");
      if (firstItem) {
        firstItem.classList.add("selected");
        state.selectedDetection = detections[0];
      }
    }
  }

  function showNoDetections() {
    elements.detectionsSection.style.display = "none";
    updateScanStatus("none", "No referral codes detected on this page");
  }

  function updateScanStatus(status, text) {
    const indicatorClass =
      status === "found"
        ? "found"
        : status === "scanning"
          ? "scanning"
          : "none";

    // Clear existing content
    elements.scanStatus.textContent = "";

    // Create indicator using DOM API
    const indicator = document.createElement("div");
    indicator.className = `status-indicator ${indicatorClass}`;

    const statusText = document.createElement("span");
    statusText.className = "status-text";
    statusText.textContent = text;

    elements.scanStatus.appendChild(indicator);
    elements.scanStatus.appendChild(statusText);
  }

  // ============================================================================
  // Capture Functionality
  // ============================================================================

  async function captureSelected() {
    if (!state.selectedDetection) {
      showToast("Please select a referral code first", "error");
      return;
    }

    elements.captureBtn.disabled = true;
    elements.captureBtn.setAttribute("aria-busy", "true");
    elements.captureBtn.textContent = "Submitting...";

    try {
      await submitReferral({
        code: state.selectedDetection.code,
        url: state.currentTab.url, // CRITICAL: Complete URL
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        source: state.selectedDetection.source,
        confidence: state.selectedDetection.confidence,
      });

      showToast("Referral code captured successfully!", "success");
      incrementStat("captured");

      // Visual feedback on button
      elements.captureBtn.textContent = "Captured! ✅";
      setTimeout(() => {
        elements.captureBtn.textContent = "✨ Capture Selected";
      }, 2000);
    } catch (err) {
      console.error("Capture error:", err);
      showToast(`Failed to capture: ${err.message}`, "error");
      elements.captureBtn.textContent = "✨ Capture Selected";
    } finally {
      elements.captureBtn.disabled = false;
      elements.captureBtn.removeAttribute("aria-busy");
    }
  }

  function showManualError(message) {
    elements.manualError.textContent = message;
    elements.manualError.classList.remove("hidden");
    elements.manualCode.classList.add("error");
  }

  async function captureManual() {
    const code = elements.manualCode.value.trim();
    const category = elements.manualCategory.value.trim() || "general";

    if (!code) {
      showManualError("Please enter a referral code");
      return;
    }

    if (code.length < 3) {
      showManualError("Code must be at least 3 characters");
      return;
    }

    elements.manualBtn.disabled = true;
    elements.manualBtn.setAttribute("aria-busy", "true");
    const originalText = elements.manualBtn.textContent;
    elements.manualBtn.textContent = "Adding...";
    elements.manualError.classList.add("hidden");

    try {
      await submitReferral({
        code: code.toUpperCase(),
        url: state.currentTab.url, // CRITICAL: Complete URL
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        source: "manual",
        confidence: 1.0,
        category: category.toLowerCase(),
      });

      showToast("Code added manually!", "success");
      elements.manualCode.value = "";
      elements.charCounter.textContent = "0/20";
      incrementStat("captured");

      // Visual feedback on button
      elements.manualBtn.textContent = "Added! ✅";
      elements.manualBtn.classList.add("btn-success");

      setTimeout(() => {
        elements.manualBtn.textContent = originalText;
        elements.manualBtn.classList.remove("btn-success");
        // Only disable if the input is still empty (e.g. user hasn't started typing a new one)
        if (elements.manualCode.value.trim().length === 0) {
          elements.manualBtn.disabled = true;
        }
      }, 2000);
    } catch (err) {
      console.error("Manual capture error:", err);
      showManualError(`Failed to add: ${err.message}`);
      elements.manualBtn.textContent = originalText;
      elements.manualBtn.disabled = false;
    } finally {
      elements.manualBtn.removeAttribute("aria-busy");
    }
  }

  // ============================================================================
  // API Submission
  // ============================================================================

  async function submitReferral(data) {
    // Build the API payload
    // CRITICAL: url field must contain COMPLETE FULL URL
    const payload = {
      code: data.code,
      url: data.url, // COMPLETE URL: https://picnic.app/de/freunde-rabatt/DOMI6869
      domain: data.domain,
      source: "extension",
      submitted_by: "browser-extension",
      metadata: {
        title: data.title || "Unknown",
        reward_type: "unknown",
        category: data.category ? [data.category] : ["general"],
        confidence_score: data.confidence || 0.8,
        detection_source: data.source || "manual",
      },
    };

    console.log("Submitting referral with complete URL:", payload.url);

    // Send to background script for API submission
    const response = await chrome.runtime.sendMessage({
      action: "submitToAPI",
      data: payload,
    });

    if (!response.success) {
      throw new Error(response.error || "Unknown error");
    }

    // Track submission
    incrementStat("submitted");
    if (response.referral?.status === "active") {
      incrementStat("success");
    }

    return response;
  }

  // ============================================================================
  // Stats Management
  // ============================================================================

  async function loadStats() {
    const stats = await chrome.storage.local.get([
      "captured",
      "submitted",
      "success",
    ]);
    elements.statCaptured.textContent = stats.captured || 0;
    elements.statSubmitted.textContent = stats.submitted || 0;
    elements.statSuccess.textContent = stats.success || 0;
  }

  async function incrementStat(key) {
    const result = await chrome.storage.local.get([key]);
    const value = (result[key] || 0) + 1;
    await chrome.storage.local.set({ [key]: value });
    document.getElementById(`stat-${key}`).textContent = value;
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  function showToast(message, type = "") {
    const toast = elements.toast;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  function populateCategories() {
    elements.categoryList.textContent = "";
    SUPPORTED_CATEGORIES.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      elements.categoryList.appendChild(option);
    });
  }

  function suggestCategory(tab) {
    if (!tab.url) return;

    try {
      const url = new URL(tab.url);
      const hostname = url.hostname.replace("www.", "");

      // Try exact match
      if (Object.prototype.hasOwnProperty.call(DOMAIN_CATEGORY_MAP, hostname)) {
        elements.manualCategory.value = DOMAIN_CATEGORY_MAP[hostname];
        return;
      }

      // Try partial match
      for (const [domain, cat] of Object.entries(DOMAIN_CATEGORY_MAP)) {
        if (hostname.includes(domain) || domain.includes(hostname)) {
        if (hostname === domain || hostname.endsWith("." + domain)) {
          return;
        }
      }

      // Keywords in title or URL
      const context = (tab.title + " " + tab.url).toLowerCase();
      if (context.includes("bank") || context.includes("invest")) {
        elements.manualCategory.value = "Finance";
      } else if (context.includes("shop") || context.includes("store")) {
        elements.manualCategory.value = "Shopping";
      } else if (context.includes("food") || context.includes("eat")) {
        elements.manualCategory.value = "Food Delivery";
      }
    } catch (e) {
      console.error("Error suggesting category:", e);
    }
  }

  function toggleSettings() {
    const isActive = elements.settingsPanel.classList.toggle("active");
    if (isActive) {
      elements.manualSection.classList.add("hidden");
    } else {
      elements.manualSection.classList.remove("hidden");
    }
    elements.settingsLink.textContent = isActive ? "Back" : "Settings";
    elements.settingsLink.setAttribute("aria-expanded", isActive.toString());
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  function setupEventListeners() {
    // Capture button
    elements.captureBtn.addEventListener("click", captureSelected);

    // Manual entry
    elements.manualBtn.addEventListener("click", captureManual);
    elements.manualCode.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !elements.manualBtn.disabled) captureManual();
    });

    // Real-time cleaning and character counter
    elements.manualCode.addEventListener("input", (e) => {
      const input = e.target;
      let value = input.value.toUpperCase();
      // Only allow alphanumeric
      value = value.replace(/[^A-Z0-9]/g, "");

      // Update value if changed
      if (input.value !== value) {
        input.value = value;
      }

      // Update counter
      const length = value.length;
      elements.charCounter.textContent = `${length}/20`;

      // Toggle button state
      elements.manualBtn.disabled = length < 3;

      // Clear error state when typing
      elements.manualError.classList.add("hidden");
      elements.manualCode.classList.remove("error");
    });

    // Settings
    elements.settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettings();
    });

    elements.saveSettingsBtn.addEventListener("click", saveSettings);

    // Refresh
    elements.refreshBtn.addEventListener("click", async () => {
      updateScanStatus("scanning", "Rescanning...");
      await requestDetections(state.currentTab);
      showToast("Page rescanned", "success");
    });
  }

  // ============================================================================
  // Start
  // ============================================================================

  init().catch(console.error);
});
