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

    updatePageInfo(tab);
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
      showToast("Please enter a valid API endpoint", "error");
      return;
    }

    state.settings.apiEndpoint = endpoint;
    await chrome.storage.sync.set({ apiEndpoint: endpoint });
    showToast("Settings saved!", "success");
    toggleSettings();
  }

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
          img.width = img.height = 32;
          img.style.borderRadius = "6px";
          img.alt = "";
          elements.favicon.textContent = "";
          elements.favicon.appendChild(img);
          faviconSet = true;
        }
      } catch {}
    }
    if (!faviconSet) elements.favicon.textContent = "🌐";
  }

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
      codeSource.textContent = d.source.replaceAll("_", " ");

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
    const indClass =
      status === "found"
        ? "found"
        : status === "scanning"
          ? "scanning"
          : "none";
    elements.scanStatus.textContent = "";
    const indicator = document.createElement("div");
    indicator.className = `status-indicator ${indClass}`;
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

  function showToast(message, type = "") {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;
    setTimeout(() => elements.toast.classList.remove("show"), 3000);
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
        copyToClipboard(state.selectedDetection.code, elements.copyDetectedBtn);
    });

    elements.copyManualBtn.addEventListener("click", () => {
      const code = elements.manualCode.value.trim();
      if (code) copyToClipboard(code.toUpperCase(), elements.copyManualBtn);
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
      updateScanStatus("scanning", "Rescanning...");
      await requestDetections(state.currentTab);
      showToast("Page rescanned", "success");
    });
  }

  init().catch(console.error);
});
