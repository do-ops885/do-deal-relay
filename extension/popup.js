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
    try {
      // Load settings
      await loadSettings();

      // Get current tab
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        state.currentTab = tab;

        // Update page info
        updatePageInfo(tab);

        // Populate categories
        populateCategories();

        // Suggest category
        suggestCategory(tab);

        // Request detections from content script
        requestDetections(tab).catch((err) =>
          console.error("Detection error:", err),
        );
      }

      // Load stats
      loadStats();

      // Setup event listeners
      setupEventListeners();
    } catch (error) {
      console.error("Initialization error:", error);
    }
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  async function loadSettings() {
    const result = await chrome.storage.sync.get(["apiEndpoint"]);
    if (result && result.apiEndpoint) {
      state.settings.apiEndpoint = result.apiEndpoint;
    }
    if (elements.apiEndpoint) {
      elements.apiEndpoint.value = state.settings.apiEndpoint;
    }
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
    if (elements.pageTitle) {
      elements.pageTitle.textContent = tab.title || "Unknown";
    }

    // Show hostname in a readable format
    if (elements.pageUrl) {
      try {
        const url = new URL(tab.url);
        elements.pageUrl.textContent = url.hostname.replace(/^www\./, "");
      } catch {
        elements.pageUrl.textContent = "Invalid URL";
      }
    }

    // Try to get favicon - using DOM API to prevent XSS
    if (tab.favIconUrl && elements.favicon) {
      try {
        const faviconUrl = new URL(tab.favIconUrl);
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
    } else if (elements.favicon) {
      elements.favicon.textContent = "🌐";
    }
  }

  // ============================================================================
  // Detection Handling
  // ============================================================================

  async function requestDetections(tab) {
    updateScanStatus("scanning", "Scanning for referral codes...");

    try {
      // Check if content script is loaded
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => typeof window.__referralDetector !== "undefined",
      });

      const isDetectorLoaded = results?.[0]?.result;

      if (!isDetectorLoaded) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

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
    if (!elements.detectionsSection) return;

    elements.detectionsSection.style.display = "block";
    updateScanStatus(
      "found",
      `${detections.length} referral code${detections.length > 1 ? "s" : ""} found`,
    );

    elements.detectionList.textContent = "";

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

    if (detections.length > 0) {
      const firstItem = elements.detectionList.querySelector(".detection-item");
      if (firstItem) {
        firstItem.classList.add("selected");
        state.selectedDetection = detections[0];
      }
    }
  }

  function showNoDetections() {
    if (elements.detectionsSection)
      elements.detectionsSection.style.display = "none";
    updateScanStatus("none", "No referral codes detected on this page");
  }

  function updateScanStatus(status, text) {
    if (!elements.scanStatus) return;

    const indicatorClass =
      status === "found"
        ? "found"
        : status === "scanning"
          ? "scanning"
          : "none";
    elements.scanStatus.textContent = "";

    const indicator = document.createElement("div");
    indicator.className = `status-indicator ${indicatorClass}`;

    const statusText = document.createElement("span");
    statusText.className = "status-text";
    statusText.textContent = text;

    elements.scanStatus.appendChild(indicator);
    elements.scanStatus.appendChild(statusText);
  }

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
        url: state.currentTab.url,
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        source: state.selectedDetection.source,
        confidence: state.selectedDetection.confidence,
      });

      showToast("Referral code captured successfully!", "success");
      incrementStat("captured");

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
    if (elements.manualError) {
      elements.manualError.textContent = message;
      elements.manualError.classList.remove("hidden");
    }
    if (elements.manualCode) {
      elements.manualCode.classList.add("error");
    }
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

    if (elements.manualError) elements.manualError.classList.add("hidden");
    if (elements.manualCode) elements.manualCode.classList.remove("error");

    try {
      await submitReferral({
        code: code.toUpperCase(),
        url: state.currentTab.url,
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        source: "manual",
        confidence: 1.0,
        category: category.toLowerCase(),
      });

      showToast("Code added manually!", "success");
      elements.manualCode.value = "";
      if (elements.charCounter) elements.charCounter.textContent = "0/20";
      incrementStat("captured");

      elements.manualBtn.textContent = "Added! ✅";

      setTimeout(() => {
        elements.manualBtn.textContent = originalText;
        elements.manualBtn.disabled =
          elements.manualCode.value.trim().length < 3;
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

  async function submitReferral(data) {
    const payload = {
      code: data.code,
      url: data.url,
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

    const response = await chrome.runtime.sendMessage({
      action: "submitToAPI",
      data: payload,
    });

    if (!response.success) {
      throw new Error(response.error || "Unknown error");
    }

    incrementStat("submitted");
    if (response.referral?.status === "active") {
      incrementStat("success");
    }

    return response;
  }

  async function loadStats() {
    const stats = await chrome.storage.local.get([
      "captured",
      "submitted",
      "success",
    ]);
    if (elements.statCaptured)
      elements.statCaptured.textContent = stats.captured || 0;
    if (elements.statSubmitted)
      elements.statSubmitted.textContent = stats.submitted || 0;
    if (elements.statSuccess)
      elements.statSuccess.textContent = stats.success || 0;
  }

  async function incrementStat(key) {
    const result = await chrome.storage.local.get([key]);
    const value = (result[key] || 0) + 1;
    await chrome.storage.local.set({ [key]: value });
    const el = document.getElementById(`stat-${key}`);
    if (el) el.textContent = value;
  }

  function showToast(message, type = "") {
    const toast = elements.toast;
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  function populateCategories() {
    if (!elements.categoryList) return;
    elements.categoryList.textContent = "";
    SUPPORTED_CATEGORIES.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      elements.categoryList.appendChild(option);
    });
  }

  function suggestCategory(tab) {
    if (!tab || !tab.url || !elements.manualCategory) return;

    try {
      const url = new URL(tab.url);
      const hostname = url.hostname.toLowerCase();
      const cleanHostname = hostname.replace(/^www\./, "");

      if (DOMAIN_CATEGORY_MAP[cleanHostname]) {
        elements.manualCategory.value = DOMAIN_CATEGORY_MAP[cleanHostname];
        return;
      }

      for (const [domain, cat] of Object.entries(DOMAIN_CATEGORY_MAP)) {
        if (cleanHostname.endsWith("." + domain)) {
          elements.manualCategory.value = cat;
          return;
        }
      }

      const context = (tab.title + " " + tab.url).toLowerCase();

      if (/(bank|invest|crypto|trading|wallet|broker)/i.test(context)) {
        elements.manualCategory.value = "Finance";
        return;
      }
      if (/(food|delivery|eats|restaurant|takeout|grocery)/i.test(context)) {
        elements.manualCategory.value = "Food Delivery";
        return;
      }
      if (/(shop|store|checkout|deals|coupon|voucher)/i.test(context)) {
        elements.manualCategory.value = "Shopping";
        return;
      }
      if (/(hotel|flight|travel|vacation|stay|booking)/i.test(context)) {
        elements.manualCategory.value = "Travel";
        return;
      }
    } catch (error) {
      console.error("Error suggesting category:", error);
    }
  }

  function toggleSettings() {
    if (!elements.settingsPanel || !elements.manualSection) return;
    const isActive = elements.settingsPanel.classList.toggle("active");
    if (isActive) {
      elements.manualSection.classList.add("hidden");
    } else {
      elements.manualSection.classList.remove("hidden");
    }
    if (elements.settingsLink) {
      elements.settingsLink.textContent = isActive ? "Back" : "Settings";
      elements.settingsLink.setAttribute("aria-expanded", isActive.toString());
    }
  }

  function setupEventListeners() {
    if (elements.captureBtn)
      elements.captureBtn.addEventListener("click", captureSelected);
    if (elements.manualBtn)
      elements.manualBtn.addEventListener("click", captureManual);
    if (elements.manualCode) {
      elements.manualCode.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !elements.manualBtn.disabled) captureManual();
      });

      elements.manualCode.addEventListener("input", (e) => {
        const input = e.target;
        const start = input.selectionStart;
        const end = input.selectionEnd;

        let value = input.value.toUpperCase();
        value = value.replace(/[^A-Z0-9]/g, "");

        if (input.value !== value) {
          input.value = value;
          input.setSelectionRange(start, end);
        }

        const length = value.length;
        if (elements.charCounter)
          elements.charCounter.textContent = `${length}/20`;
        if (elements.manualBtn) elements.manualBtn.disabled = length === 0;

        if (elements.manualError) elements.manualError.classList.add("hidden");
        elements.manualCode.classList.remove("error");
      });
    }

    if (elements.settingsLink) {
      elements.settingsLink.addEventListener("click", (e) => {
        e.preventDefault();
        toggleSettings();
      });
    }

    if (elements.saveSettingsBtn)
      elements.saveSettingsBtn.addEventListener("click", saveSettings);

    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener("click", async () => {
        updateScanStatus("scanning", "Rescanning...");
        if (state.currentTab) await requestDetections(state.currentTab);
        showToast("Page rescanned", "success");
      });
    }
  }

  init().catch(console.error);
});
