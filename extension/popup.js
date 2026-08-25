/**
 * Referral Capture - Popup Logic
 * Handles the extension popup UI and API communication.
 * CRITICAL: Always sends COMPLETE URLs to the API.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const state = {
    currentTab: null,
    detections: [],
    selectedDetection: null,
    settings: {
      apiEndpoint: "http://localhost:8787",
    },
  };

  const get = (id) => document.getElementById(id);
  const elements = {
    pageTitle: get("page-title"),
    pageUrl: get("page-url"),
    favicon: get("favicon"),
    scanStatus: get("scan-status"),
    detectionsSection: get("detections-section"),
    detectionList: get("detection-list"),
    captureBtn: get("capture-btn"),
    manualSection: get("manual-section"),
    manualCode: get("manual-code"),
    manualBtn: get("manual-btn"),
    settingsPanel: get("settings-panel"),
    settingsLink: get("settings-link"),
    apiEndpoint: get("api-endpoint"),
    saveSettingsBtn: get("save-settings-btn"),
    refreshBtn: get("refresh-btn"),
    toast: get("toast"),
    statCaptured: get("stat-captured"),
    statSubmitted: get("stat-submitted"),
    statSuccess: get("stat-success"),
    manualCodeError: get("manual-code-error"),
    copyDetectedBtn: get("copy-detected-btn"),
    copyManualBtn: get("copy-manual-btn"),
    apiEndpointError: get("api-endpoint-error"),
  };

  async function init() {
    await loadSettings();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    state.currentTab = tab;

    updatePageInfo(elements, tab);
    await requestDetections(tab);
    loadStats();
    setupEventListeners();
  }

  function validateApiEndpoint(urlStr, forceShow = false) {
    let isValid = false;
    try {
      const url = new URL(urlStr);
      isValid = url.protocol === "http:" || url.protocol === "https:";
    } catch {
      isValid = false;
    }

    const shouldShowError =
      urlStr.length > 0 && (forceShow || urlStr.length > 5);

    if (shouldShowError) {
      elements.apiEndpoint.classList.toggle("invalid", !isValid);
      elements.apiEndpointError.classList.toggle("hidden", isValid);
      elements.apiEndpoint.setAttribute("aria-invalid", (!isValid).toString());
    } else {
      elements.apiEndpoint.classList.remove("invalid");
      elements.apiEndpointError.classList.add("hidden");
      elements.apiEndpoint.removeAttribute("aria-invalid");
    }

    elements.saveSettingsBtn.disabled = !isValid;
    return isValid;
  }

  async function loadSettings() {
    const result = await chrome.storage.sync.get(["apiEndpoint"]);
    if (result.apiEndpoint) {
      state.settings.apiEndpoint = result.apiEndpoint;
    }
    elements.apiEndpoint.value = state.settings.apiEndpoint;
    validateApiEndpoint(state.settings.apiEndpoint, false);
  }

  async function saveSettings() {
    const endpoint = elements.apiEndpoint.value.trim();
    if (!validateApiEndpoint(endpoint, true)) {
      showToast(elements, "Please enter a valid API endpoint", "error");
      return;
    }

    state.settings.apiEndpoint = endpoint;
    await chrome.storage.sync.set({ apiEndpoint: endpoint });
    showToast(elements, "Settings saved!", "success");
    toggleSettings();
  }

  async function requestDetections(tab) {
    updateScanStatus(elements, "scanning", "Scanning for referral codes...");
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
        showDetections(state, elements, response.referrals);
      } else {
        showNoDetections(elements);
      }
    } catch (error) {
      console.error("Error getting detections:", error);
      showNoDetections(elements);
    }
  }

  async function captureSelected() {
    if (!state.selectedDetection) {
      showToast(elements, "Please select a referral code first", "error");
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

      showToast(elements, "Referral code captured successfully!", "success");
      incrementStat("captured");
      elements.captureBtn.textContent = "Captured! ✅";
      setTimeout(() => {
        elements.captureBtn.textContent = "✨ Capture Selected";
      }, 2000);
    } catch (err) {
      console.error("Capture error:", err);
      showToast(elements, `Failed to capture: ${err.message}`, "error");
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

      showToast(elements, "Code added manually!", "success");
      elements.manualCode.value = "";
      incrementStat("captured");
      elements.manualBtn.textContent = "Added! ✅";
      setTimeout(() => {
        elements.manualBtn.textContent = "Add Code Manually";
      }, 2000);
    } catch (err) {
      showToast(elements, `Failed to add: ${err.message}`, "error");
      elements.manualBtn.textContent = "Add Code Manually";
    } finally {
      elements.manualBtn.disabled = false;
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

  function toggleSettings() {
    const isActive = elements.settingsPanel.classList.toggle("active");
    elements.manualSection.classList.toggle("hidden");
    elements.settingsLink.textContent = isActive ? "Back" : "Settings";
    elements.settingsLink.setAttribute("aria-expanded", isActive.toString());

    if (isActive) {
      validateApiEndpoint(elements.apiEndpoint.value.trim(), false);
      elements.apiEndpoint.focus();
    } else {
      elements.settingsLink.focus();
    }
  }

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
    elements.manualCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") captureManual();
    });

    elements.copyDetectedBtn.addEventListener("click", () => {
      if (state.selectedDetection)
        copyToClipboard(
          elements,
          state.selectedDetection.code,
          elements.copyDetectedBtn,
        );
    });

    elements.copyManualBtn.addEventListener("click", () => {
      const code = elements.manualCode.value.trim();
      if (code)
        copyToClipboard(elements, code.toUpperCase(), elements.copyManualBtn);
    });

    elements.settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettings();
    });

    elements.apiEndpoint.addEventListener("input", (e) => {
      validateApiEndpoint(e.target.value.trim(), false);
    });

    elements.apiEndpoint.addEventListener("blur", (e) => {
      validateApiEndpoint(e.target.value.trim(), true);
    });

    elements.apiEndpoint.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !elements.saveSettingsBtn.disabled) {
        saveSettings();
      }
    });

    elements.saveSettingsBtn.addEventListener("click", saveSettings);

    elements.refreshBtn.addEventListener("click", async () => {
      updateScanStatus(elements, "scanning", "Rescanning...");
      await requestDetections(state.currentTab);
      showToast(elements, "Page rescanned", "success");
    });
  }

  init().catch(console.error);
});
