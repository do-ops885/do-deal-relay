/**
 * Referral Capture - Popup Logic
 * Handles the extension popup UI and API communication.
 * CRITICAL: Always sends COMPLETE URLs to the API.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // State Management
  const state = {
    currentTab: null,
    detections: [],
    selectedDetection: null,
    settings: {
      apiEndpoint: "http://localhost:8787", // Default local dev endpoint
    },
  };

  // DOM Element References
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
    manualBtn: document.getElementById("manual-btn"),
    settingsPanel: document.getElementById("settings-panel"),
    settingsLink: document.getElementById("settings-link"),
    apiEndpoint: document.getElementById("api-endpoint"),
    saveSettingsBtn: document.getElementById("save-settings-btn"),
    refreshBtn: document.getElementById("refresh-btn"),
    toast: document.getElementById("toast"),
    statCaptured: document.getElementById("stat-captured"),
    statSubmitted: document.getElementById("stat-submitted"),
    statSuccess: document.getElementById("stat-success"),
    manualCodeError: document.getElementById("manual-code-error"),
    copyDetectedBtn: document.getElementById("copy-detected-btn"),
    copyManualBtn: document.getElementById("copy-manual-btn"),
  };

  // Initialization
  async function init() {
    await loadSettings();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    state.currentTab = tab;

    updatePageInfo(tab);
    await requestDetections(tab);
    loadStats();
    setupEventListeners();
  }

  // Settings Management
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

  // Page Information
  function updatePageInfo(tab) {
    elements.pageTitle.textContent = tab.title || "Unknown";
    try {
      elements.pageUrl.textContent = new URL(tab.url).hostname;
    } catch {
      elements.pageUrl.textContent = "Invalid URL";
    }

    let faviconSet = false;
    if (tab.favIconUrl) {
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
          faviconSet = true;
        }
      } catch {}
    }
    if (!faviconSet) {
      elements.favicon.textContent = "🌐";
    }
  }

  // Detection Handling
  async function requestDetections(tab) {
    updateScanStatus("scanning", "Scanning for referral codes...");
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => typeof window.__referralDetector !== "undefined",
      });

      if (!results?.[0]?.result) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getDetections",
      });

      if (response?.referrals?.length > 0) {
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
        firstItem.setAttribute("aria-pressed", "true");
        state.selectedDetection = detections[0];
        elements.captureBtn.focus();
      }
    }
  }

  function showNoDetections() {
    elements.detectionsSection.style.display = "none";
    updateScanStatus("none", "No referral codes detected on this page");
    elements.manualCode.focus();
  }

  function updateScanStatus(status, text) {
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

  // Capture Functionality
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

  async function captureManual() {
    const code = elements.manualCode.value.trim();
    if (!validateManualCode(code)) return;

    elements.manualBtn.disabled = true;
    elements.manualBtn.setAttribute("aria-busy", "true");
    elements.manualBtn.textContent = "Adding...";

    try {
      await submitReferral({
        code: code.toUpperCase(),
        url: state.currentTab.url, // CRITICAL: Complete URL
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        source: "manual",
        confidence: 1.0,
      });

      showToast("Code added manually!", "success");
      elements.manualCode.value = "";
      incrementStat("captured");
      elements.manualBtn.textContent = "Added! ✅";
      setTimeout(() => {
        elements.manualBtn.textContent = "Add Code Manually";
      }, 2000);
    } catch (err) {
      showToast(`Failed to add: ${err.message}`, "error");
      elements.manualBtn.textContent = "Add Code Manually";
    } finally {
      elements.manualBtn.disabled = false;
      elements.manualBtn.removeAttribute("aria-busy");
    }
  }

  // API Submission
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
        category: ["general"],
        confidence_score: data.confidence || 0.8,
        detection_source: data.source || "manual",
      },
    };

    console.log("Submitting referral with complete URL:", payload.url);
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

  // Stats Management
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

  // UI Helpers
  function showToast(message, type = "") {
    const toast = elements.toast;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  async function copyToClipboard(text, buttonElement) {
    if (!text || buttonElement.dataset.copying === "true") return;

    const originalLabel = buttonElement.getAttribute("aria-label");
    const originalTitle = buttonElement.getAttribute("title");

    try {
      buttonElement.dataset.copying = "true";
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard!", "success");

      const children = Array.from(buttonElement.children);
      buttonElement.textContent = "";
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = "✅";
      buttonElement.appendChild(span);

      buttonElement.setAttribute("aria-label", "Copied!");
      buttonElement.setAttribute("title", "Copied!");

      setTimeout(() => {
        buttonElement.textContent = "";
        children.forEach((child) => buttonElement.appendChild(child));
        originalLabel
          ? buttonElement.setAttribute("aria-label", originalLabel)
          : buttonElement.removeAttribute("aria-label");
        originalTitle
          ? buttonElement.setAttribute("title", originalTitle)
          : buttonElement.removeAttribute("title");
        buttonElement.removeAttribute("data-copying");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy", "error");
      buttonElement.removeAttribute("data-copying");
    }
  }

  function toggleSettings() {
    const isActive = elements.settingsPanel.classList.toggle("active");
    elements.manualSection.classList.toggle("hidden");
    elements.settingsLink.textContent = isActive ? "Back" : "Settings";
    elements.settingsLink.setAttribute("aria-expanded", isActive.toString());

    if (isActive) {
      elements.apiEndpoint.focus();
    } else {
      elements.settingsLink.focus();
    }
  }

  // Event Listeners
  function validateManualCode(code, forceShow = false) {
    const isValid = /^[A-Z0-9]{4,20}$/i.test(code);
    const shouldShowError = code.length > 0 && (forceShow || code.length >= 4);

    if (shouldShowError) {
      elements.manualCode.classList.toggle("invalid", !isValid);
      elements.manualCodeError.classList.toggle("hidden", isValid);
      elements.manualCode.setAttribute("aria-invalid", (!isValid).toString());
    } else {
      elements.manualCode.classList.remove("invalid");
      elements.manualCodeError.classList.add("hidden");
      elements.manualCode.removeAttribute("aria-invalid");
    }

    elements.manualBtn.disabled = !isValid;
    elements.copyManualBtn.disabled = !isValid;
    return isValid;
  }

  function setupEventListeners() {
    elements.captureBtn.addEventListener("click", captureSelected);
    elements.manualBtn.addEventListener("click", captureManual);
    elements.manualCode.addEventListener("input", (e) => {
      const raw = e.target.value;
      const cleaned = raw
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 20);
      if (cleaned !== raw) {
        e.target.value = cleaned;
      }
      validateManualCode(cleaned, false);
    });

    elements.manualCode.addEventListener("blur", (e) => {
      validateManualCode(e.target.value, true);
    });
    elements.manualCode.addEventListener("keypress", (e) => {
      if (e.key === "Enter") captureManual();
    });

    elements.copyDetectedBtn.addEventListener("click", () => {
      if (state.selectedDetection) {
        copyToClipboard(state.selectedDetection.code, elements.copyDetectedBtn);
      }
    });

    elements.copyManualBtn.addEventListener("click", () => {
      const code = elements.manualCode.value.trim();
      if (code) {
        copyToClipboard(code.toUpperCase(), elements.copyManualBtn);
      }
    });

    elements.settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettings();
    });

    elements.saveSettingsBtn.addEventListener("click", saveSettings);

    elements.refreshBtn.addEventListener("click", async () => {
      updateScanStatus("scanning", "Rescanning...");
      await requestDetections(state.currentTab);
      showToast("Page rescanned", "success");
    });
  }

  // Start
  init().catch(console.error);
});
