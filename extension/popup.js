/**
 * Referral Capture - Popup Logic
 * Uses PopupRender helpers (popup-render.js) to stay under 500 lines.
 */

/* global chrome, PopupRender */
/* eslint-disable security/detect-object-injection */

document.addEventListener("DOMContentLoaded", async () => {
  const state = {
    currentTab: null,
    detections: [],
    selectedDetection: null,
    settings: { apiEndpoint: "http://localhost:8787" },
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
    lastPollTime: get("last-poll-time"),
    feedBadge: get("feed-badge"),
    dealFeedList: get("deal-feed-list"),
    feedEmpty: get("feed-empty"),
    refreshDealsBtn: get("refresh-deals-btn"),
    clearBadgeBtn: get("clear-badge-btn"),
  };

  async function init() {
    await loadSettings();
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    state.currentTab = tab;
    PopupRender.updatePageInfo(tab, elements);
    await requestDetections(tab);
    loadStats();
    await loadDealFeed();
    setupEventListeners();
  }

  function validateApiEndpoint(urlStr, forceShow = false) {
    let valid = false;
    try {
      const u = new URL(urlStr);
      valid = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      valid = false;
    }
    const show = urlStr.length > 0 && (forceShow || urlStr.length > 5);
    if (show) {
      elements.apiEndpoint.classList.toggle("invalid", !valid);
      elements.apiEndpointError.classList.toggle("hidden", valid);
      elements.apiEndpoint.setAttribute("aria-invalid", String(!valid));
    } else {
      elements.apiEndpoint.classList.remove("invalid");
      elements.apiEndpointError.classList.add("hidden");
      elements.apiEndpoint.removeAttribute("aria-invalid");
    }
    elements.saveSettingsBtn.disabled = !valid;
    return valid;
  }

  async function loadSettings() {
    const r = await chrome.storage.sync.get(["apiEndpoint"]);
    if (r.apiEndpoint) state.settings.apiEndpoint = r.apiEndpoint;
    elements.apiEndpoint.value = state.settings.apiEndpoint;
    validateApiEndpoint(state.settings.apiEndpoint, false);
  }

  async function saveSettings() {
    const ep = elements.apiEndpoint.value.trim();
    if (!validateApiEndpoint(ep, true)) {
      showToast("Please enter a valid API endpoint", "error");
      return;
    }
    state.settings.apiEndpoint = ep;
    await chrome.storage.sync.set({ apiEndpoint: ep });
    try {
      await chrome.runtime.sendMessage({
        action: "updateSettings",
        apiEndpoint: ep,
      });
    } catch {}
    showToast("Settings saved!", "success");
    toggleSettings();
  }

  async function requestDetections(tab) {
    PopupRender.updateScanStatus(
      "scanning",
      "Scanning for referral codes...",
      elements,
    );
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => typeof window.__referralDetector !== "undefined",
      });
      if (!res?.[0]?.result) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await new Promise((r) => setTimeout(r, 500));
      }
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getDetections",
      });
      if (response?.referrals?.length > 0) {
        state.detections = response.referrals;
        PopupRender.showDetections(response.referrals, elements, state);
      } else PopupRender.showNoDetections(elements);
    } catch (e) {
      console.error("Error getting detections:", e);
      PopupRender.showNoDetections(elements);
    }
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

  async function captureManual() {
    const code = elements.manualCode.value.trim();
    if (!validateManualCode(code)) return;
    elements.manualBtn.disabled = true;
    elements.manualBtn.setAttribute("aria-busy", "true");
    elements.manualBtn.textContent = "Adding...";
    try {
      await submitReferral({
        code: code.toUpperCase(),
        url: state.currentTab.url,
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
    const response = await chrome.runtime.sendMessage({
      action: "submitToAPI",
      data: payload,
    });
    if (!response.success) throw new Error(response.error || "Unknown error");
    incrementStat("submitted");
    if (response.referral?.status === "active") incrementStat("success");
    return response;
  }

  async function loadStats() {
    const s = await chrome.storage.local.get([
      "captured",
      "submitted",
      "success",
    ]);
    elements.statCaptured.textContent = s.captured || 0;
    elements.statSubmitted.textContent = s.submitted || 0;
    elements.statSuccess.textContent = s.success || 0;
  }

  // eslint-disable-next-line require-await
  async function incrementStat(key) {
    const r = await chrome.storage.local.get([key]);
    const v = (r[key] || 0) + 1;
    await chrome.storage.local.set({ [key]: v });
    const el = document.getElementById(`stat-${key}`);
    if (el) el.textContent = v;
    try {
      await chrome.runtime.sendMessage({ action: "syncStats" });
    } catch {}
  }

  // eslint-disable-next-line require-await
  async function loadDealFeed() {
    try {
      const res = await chrome.runtime.sendMessage({ action: "getDealFeed" });
      if (res?.meta) PopupRender.renderDealFeed(res.meta, elements);
      else if (res?.lastPoll)
        PopupRender.renderDealFeed(
          {
            lastPoll: res.lastPoll,
            newCount: res.newCount,
            highValueDeals: res.meta?.highValueDeals || [],
          },
          elements,
        );
      else {
        const local = await chrome.storage.local.get([
          "dealFeedMeta",
          "dealFeedLastPoll",
          "dealFeedNewDeals",
        ]);
        const meta = local.dealFeedMeta || null;
        if (meta) PopupRender.renderDealFeed(meta, elements);
        else PopupRender.renderDealFeed(null, elements);
      }
    } catch {
      const local = await chrome.storage.local.get(["dealFeedMeta"]);
      PopupRender.renderDealFeed(local.dealFeedMeta || null, elements);
    }
  }

  async function triggerDealPoll() {
    if (elements.refreshDealsBtn) {
      elements.refreshDealsBtn.disabled = true;
      elements.refreshDealsBtn.textContent = "Polling...";
    }
    try {
      await chrome.runtime.sendMessage({ action: "triggerPoll" });
      await loadDealFeed();
      showToast("Deal feed refreshed", "success");
    } catch {
      showToast("Refresh failed", "error");
    } finally {
      if (elements.refreshDealsBtn) {
        elements.refreshDealsBtn.disabled = false;
        elements.refreshDealsBtn.textContent = "Refresh deals";
      }
    }
  }

  async function clearDealBadge() {
    try {
      await chrome.runtime.sendMessage({ action: "clearDealBadge" });
    } catch {}
    await chrome.storage.local.set({ dealFeedNewDeals: 0 });
    const meta = await chrome.storage.local.get(["dealFeedMeta"]);
    if (meta.dealFeedMeta) {
      meta.dealFeedMeta.newCount = 0;
      await chrome.storage.local.set({ dealFeedMeta: meta.dealFeedMeta });
      PopupRender.renderDealFeed(meta.dealFeedMeta, elements);
    }
  }

  function showToast(message, type = "") {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} show`;
    setTimeout(() => elements.toast.classList.remove("show"), 3000);
  }

  async function copyToClipboard(text, btn) {
    if (!text || btn.dataset.copying === "true") return;
    const origLabel = btn.getAttribute("aria-label");
    const origTitle = btn.getAttribute("title");
    try {
      btn.dataset.copying = "true";
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard!", "success");
      const children = Array.from(btn.children);
      btn.textContent = "";
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      span.textContent = "✅";
      btn.appendChild(span);
      btn.setAttribute("aria-label", "Copied!");
      btn.setAttribute("title", "Copied!");
      setTimeout(() => {
        btn.textContent = "";
        children.forEach((c) => {
          btn.appendChild(c);
        });
        origLabel
          ? btn.setAttribute("aria-label", origLabel)
          : btn.removeAttribute("aria-label");
        origTitle
          ? btn.setAttribute("title", origTitle)
          : btn.removeAttribute("title");
        btn.removeAttribute("data-copying");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy", "error");
      btn.removeAttribute("data-copying");
    }
  }

  function toggleSettings() {
    const active = elements.settingsPanel.classList.toggle("active");
    elements.manualSection.classList.toggle("hidden");
    elements.settingsLink.textContent = active ? "Back" : "Settings";
    elements.settingsLink.setAttribute("aria-expanded", String(active));
    if (active) {
      validateApiEndpoint(elements.apiEndpoint.value.trim(), false);
      elements.apiEndpoint.focus();
    } else elements.settingsLink.focus();
  }

  function validateManualCode(code, forceShow = false) {
    const valid = /^[A-Z0-9]{4,20}$/i.test(code);
    const show = code.length > 0 && (forceShow || code.length >= 4);
    if (show) {
      elements.manualCode.classList.toggle("invalid", !valid);
      elements.manualCodeError.classList.toggle("hidden", valid);
      elements.manualCode.setAttribute("aria-invalid", String(!valid));
    } else {
      elements.manualCode.classList.remove("invalid");
      elements.manualCodeError.classList.add("hidden");
      elements.manualCode.removeAttribute("aria-invalid");
    }
    elements.manualBtn.disabled = !valid;
    elements.copyManualBtn.disabled = !valid;
    return valid;
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
      if (cleaned !== raw) e.target.value = cleaned;
      validateManualCode(cleaned, false);
    });
    elements.manualCode.addEventListener("blur", (e) =>
      validateManualCode(e.target.value, true),
    );
    elements.manualCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") captureManual();
    });
    elements.copyDetectedBtn.addEventListener("click", () => {
      if (state.selectedDetection)
        copyToClipboard(state.selectedDetection.code, elements.copyDetectedBtn);
    });
    elements.copyManualBtn.addEventListener("click", () => {
      const c = elements.manualCode.value.trim();
      if (c) copyToClipboard(c.toUpperCase(), elements.copyManualBtn);
    });
    elements.settingsLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSettings();
    });
    elements.apiEndpoint.addEventListener("input", (e) =>
      validateApiEndpoint(e.target.value.trim(), false),
    );
    elements.apiEndpoint.addEventListener("blur", (e) =>
      validateApiEndpoint(e.target.value.trim(), true),
    );
    elements.apiEndpoint.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !elements.saveSettingsBtn.disabled)
        saveSettings();
    });
    elements.saveSettingsBtn.addEventListener("click", saveSettings);
    elements.refreshBtn.addEventListener("click", async () => {
      PopupRender.updateScanStatus("scanning", "Rescanning...", elements);
      await requestDetections(state.currentTab);
      showToast("Page rescanned", "success");
    });
    if (elements.refreshDealsBtn)
      elements.refreshDealsBtn.addEventListener("click", triggerDealPoll);
    if (elements.clearBadgeBtn)
      elements.clearBadgeBtn.addEventListener("click", clearDealBadge);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (
        area === "local" &&
        (changes.dealFeedMeta ||
          changes.dealFeedLastPoll ||
          changes.dealFeedNewDeals)
      )
        loadDealFeed();
    });
  }

  init().catch(console.error);
});
