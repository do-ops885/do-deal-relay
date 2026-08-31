/**
 * Referral Capture - Popup Render Helpers
 * Extracted to keep popup.js under 500 lines.
 * Loaded before popup.js via <script src="popup-render.js">.
 */

/* global chrome */
/* eslint-disable */
/* exported PopupRender */
/* eslint-disable security/detect-object-injection */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// eslint-disable-next-line no-unused-vars
const PopupRender = {
  updatePageInfo(tab, elements) {
    elements.pageTitle.textContent = tab.title || "Unknown";
    try {
      elements.pageUrl.textContent = new URL(tab.url).hostname;
    } catch {
      elements.pageUrl.textContent = "Invalid URL";
    }
    let set = false;
    if (tab.favIconUrl) {
      try {
        const u = new URL(tab.favIconUrl);
        if (u.protocol === "http:" || u.protocol === "https:") {
          const img = document.createElement("img");
          img.src = u.href;
          img.width = img.height = 32;
          img.style.borderRadius = "6px";
          img.alt = "";
          elements.favicon.textContent = "";
          elements.favicon.appendChild(img);
          set = true;
        }
      } catch {}
    }
    if (!set) elements.favicon.textContent = "🌐";
  },

  updateScanStatus(status, text, elements) {
    const cls =
      status === "found"
        ? "found"
        : status === "scanning"
          ? "scanning"
          : "none";
    elements.scanStatus.textContent = "";
    const ind = document.createElement("div");
    ind.className = `status-indicator ${cls}`;
    const span = document.createElement("span");
    span.className = "status-text";
    span.textContent = text;
    elements.scanStatus.appendChild(ind);
    elements.scanStatus.appendChild(span);
  },

  showDetections(detections, elements, state) {
    elements.detectionsSection.style.display = "block";
    this.updateScanStatus(
      "found",
      `${detections.length} referral code${detections.length > 1 ? "s" : ""} found`,
      elements,
    );
    elements.detectionList.textContent = "";
    detections.forEach((d, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "detection-item";
      item.dataset.index = String(i);
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
      const conf = document.createElement("span");
      conf.className = "confidence";
      conf.textContent = `${Math.round(d.confidence * 100)}%`;
      item.appendChild(info);
      item.appendChild(conf);
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
      const first = elements.detectionList.querySelector(".detection-item");
      if (first) {
        first.classList.add("selected");
        first.setAttribute("aria-pressed", "true");
        state.selectedDetection = detections[0];
        elements.captureBtn.focus();
      }
    }
  },

  showNoDetections(elements) {
    elements.detectionsSection.style.display = "none";
    this.updateScanStatus(
      "none",
      "No referral codes detected on this page",
      elements,
    );
    elements.manualCode.focus();
  },

  formatRelativeTime(iso) {
    if (!iso) return "Never polled";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < MS_PER_DAY) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(iso).toLocaleString();
  },

  renderDealFeed(meta, elements) {
    if (!meta || !meta.lastPoll) {
      elements.lastPollTime.textContent = "Never polled";
      elements.feedBadge.classList.add("hidden");
      elements.feedBadge.textContent = "0 new";
      if (elements.clearBadgeBtn)
        elements.clearBadgeBtn.classList.add("hidden");
      if (elements.dealFeedList) elements.dealFeedList.textContent = "";
      if (elements.feedEmpty) elements.feedEmpty.classList.remove("hidden");
      return;
    }
    elements.lastPollTime.textContent = `Last poll: ${this.formatRelativeTime(meta.lastPoll)}`;
    const count = meta.newCount || 0;
    if (count > 0) {
      elements.feedBadge.textContent = `${count} new`;
      elements.feedBadge.classList.remove("hidden");
      if (elements.clearBadgeBtn)
        elements.clearBadgeBtn.classList.remove("hidden");
    } else {
      elements.feedBadge.classList.add("hidden");
      elements.feedBadge.textContent = "0 new";
      if (elements.clearBadgeBtn)
        elements.clearBadgeBtn.classList.add("hidden");
    }
    if (elements.dealFeedList) {
      elements.dealFeedList.textContent = "";
      const deals = meta.highValueDeals || [];
      if (deals.length === 0) {
        if (elements.feedEmpty) elements.feedEmpty.classList.remove("hidden");
      } else {
        if (elements.feedEmpty) elements.feedEmpty.classList.add("hidden");
        deals.forEach((d) => {
          const row = document.createElement("div");
          row.className = "feed-item";
          const top = document.createElement("div");
          top.className = "feed-item-top";
          const code = document.createElement("span");
          code.className = "code-value";
          code.style.fontSize = "13px";
          code.textContent = d.code;
          const reward = document.createElement("span");
          reward.className = "confidence";
          reward.style.background = "#fef3c7";
          reward.style.color = "#92400e";
          const rv = d.reward?.value ?? "";
          reward.textContent = rv ? `$${rv}` : "$100+";
          top.appendChild(code);
          top.appendChild(reward);
          const sub = document.createElement("div");
          sub.className = "code-source";
          sub.textContent = d.domain || d.title || "";
          row.appendChild(top);
          row.appendChild(sub);
          if (d.url) {
            row.style.cursor = "pointer";
            row.title = d.url;
            row.addEventListener("click", () => {
              chrome.tabs.create({ url: d.url });
            });
          }
          elements.dealFeedList.appendChild(row);
        });
      }
    }
  },
};
