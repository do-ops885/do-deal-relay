/** Referral Capture - Background Service Worker */
const DEFAULT_API_BASE = "http://localhost:8787";
const POLL_MIN = 5;
const HIGH_THR = 100;
const A_POLL = "dealPoll";
const A_SYNC = "syncStats";
const K_SEEN = "dealFeedSeenIds";
const K_META = "dealFeedMeta";
const K_LAST = "dealFeedLastPoll";
const K_NEW = "dealFeedNewDeals";
class ExtensionService {
  constructor() {
    this.apiBaseUrl = DEFAULT_API_BASE;
    this.init();
  }
  async init() {
    await this.loadSettings();
    this.setupContextMenus();
    this.setupCommandListener();
    this.setupMessageHandlers();
    this.setupTabListeners();
    this.setupAlarms();
    console.log("Referral Capture extension initialized");
  }
  async loadSettings() {
    try {
      const r = await chrome.storage.sync.get(["apiEndpoint"]);
      if (r.apiEndpoint) this.apiBaseUrl = r.apiEndpoint;
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }
  setupAlarms() {
    if (!chrome.alarms) return;
    chrome.alarms.create(A_POLL, { periodInMinutes: POLL_MIN });
    chrome.alarms.create(A_SYNC, { periodInMinutes: POLL_MIN * 3 });
    chrome.alarms.onAlarm.addListener((a) => {
      if (a.name === A_POLL) this.pollDeals();
      if (a.name === A_SYNC) this.syncCaptureStats();
    });
    this.pollDeals();
  }
  async pollDeals() {
    const start = Date.now();
    let deals = [];
    const eps = [
      `${this.apiBaseUrl}/deals?limit=100`,
      `${this.apiBaseUrl}/api/referrals?limit=100`,
    ];
    for (const ep of eps) {
      try {
        const resp = await fetch(ep, {
          headers: { "X-Extension-Version": "1.0.0" },
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        if (Array.isArray(data)) deals = data;
        else if (Array.isArray(data.deals)) deals = data.deals;
        else if (Array.isArray(data.referrals)) deals = data.referrals;
        else if (Array.isArray(data.data)) deals = data.data;
        if (deals.length > 0) break;
      } catch {}
    }
    const high = deals.filter((d) => this.isHighValue(d));
    const stored = await chrome.storage.local.get([K_SEEN, K_META]);
    const seen = new Set(stored[K_SEEN] || []);
    const newHigh = high.filter((d) => {
      const id = d.id || d.code;
      return id && !seen.has(id);
    });
    const nowIso = new Date().toISOString();
    const updated = [...seen];
    for (const d of high) {
      const id = d.id || d.code;
      if (id && !seen.has(id)) updated.push(id);
    }
    const trimmed = updated.slice(-500);
    const meta = {
      lastPoll: nowIso,
      lastPollMs: start,
      totalDeals: deals.length,
      highValueCount: high.length,
      newCount: newHigh.length,
      highValueDeals: high.slice(0, 20).map((d) => ({
        id: d.id || d.code,
        code: d.code,
        title: d.title || d.domain || d.code,
        reward: d.reward,
        domain: d.source?.domain || d.domain || "",
        url: d.url || "",
      })),
    };
    await chrome.storage.local.set({
      [K_SEEN]: trimmed,
      [K_META]: meta,
      [K_LAST]: nowIso,
      [K_NEW]: newHigh.length,
    });
    if (newHigh.length > 0) {
      this.updateGlobalBadge(newHigh.length);
      this.notifyHighValue(newHigh);
    }
    this.syncCaptureStats();
  }
  isHighValue(d) {
    let n = 0;
    const v = d.reward?.value;
    if (typeof v === "number") n = v;
    else if (typeof v === "string") {
      const p = parseFloat(v.replace(/[^0-9.]/g, ""));
      n = Number.isNaN(p) ? 0 : p;
    } else if (typeof d.reward_value === "number") n = d.reward_value;
    else if (typeof d.metadata?.reward_value === "number")
      n = d.metadata.reward_value;
    return n > HIGH_THR;
  }
  updateGlobalBadge(c) {
    try {
      if (c > 0) {
        chrome.action.setBadgeText({ text: c > 99 ? "99+" : String(c) });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      } else chrome.action.setBadgeText({ text: "" });
    } catch {}
  }
  notifyHighValue(deals) {
    const cnt = deals.length;
    const title =
      cnt === 1
        ? `High-value deal: ${deals[0].code}`
        : `${cnt} new high-value deals`;
    let msg = "";
    if (cnt === 1) {
      const d = deals[0];
      const val = d.reward?.value ?? "100+";
      msg = `${d.title || d.code} — reward ${val}`;
    } else {
      msg = deals
        .slice(0, 3)
        .map((d) => d.code)
        .join(", ");
      if (cnt > 3) msg += ` +${cnt - 3} more`;
    }
    this.showNotification(title, msg);
  }
  async syncCaptureStats() {
    try {
      const stats = await chrome.storage.local.get([
        "captured",
        "submitted",
        "success",
      ]);
      const s = await chrome.storage.sync.get(["extensionUserId"]);
      let uid = s.extensionUserId;
      if (!uid) {
        uid = self.crypto?.randomUUID
          ? self.crypto.randomUUID()
          : (() => {
              const bytes = new Uint8Array(8);
              self.crypto.getRandomValues(bytes);
              const rand = Array.from(bytes, (b) =>
                b.toString(16).padStart(2, "0"),
              ).join("");
              return `ext-${Date.now()}-${rand}`;
            })();
        await chrome.storage.sync.set({ extensionUserId: uid });
      }
      const payload = {
        userId: uid,
        stats: {
          captured: stats.captured || 0,
          submitted: stats.submitted || 0,
          success: stats.success || 0,
        },
        timestamp: new Date().toISOString(),
        source: "extension",
      };
      const eps = [
        `${this.apiBaseUrl}/api/analytics/extension-sync`,
        `${this.apiBaseUrl}/api/extension/stats`,
        `${this.apiBaseUrl}/api/analytics`,
      ];
      for (const ep of eps) {
        try {
          const r = await fetch(ep, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Extension-Version": "1.0.0",
              "X-Extension-User": uid,
            },
            body: JSON.stringify(payload),
          });
          if (r.ok || r.status === 404 || r.status === 401) break;
        } catch {}
      }
    } catch {}
  }
  setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "capture-referral",
        title: "🎁 Capture Referral Code",
        contexts: ["page", "selection", "link"],
      });
      chrome.contextMenus.create({
        id: "capture-selection",
        title: "Capture Selection as Referral Code",
        contexts: ["selection"],
      });
      chrome.contextMenus.create({
        id: "capture-link",
        title: "Capture Link Referral Code",
        contexts: ["link"],
      });
    });
    chrome.contextMenus.onClicked.addListener((info, tab) =>
      this.handleContextMenuClick(info, tab),
    );
  }
  async handleContextMenuClick(info, tab) {
    let code = null;
    let url = tab.url;
    const title = tab.title;
    if (info.menuItemId === "capture-selection" && info.selectionText) {
      code = info.selectionText.trim().toUpperCase();
      if (!this.isValidCode(code)) {
        this.showNotification(
          "Invalid Code",
          "Selected text does not appear to be a valid referral code.",
        );
        return;
      }
    } else if (info.menuItemId === "capture-link" && info.linkUrl) {
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
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, {
          action: "getDetections",
        });
        if (resp?.referrals?.length > 0) {
          const best = resp.referrals.reduce((b, c) =>
            c.confidence > b.confidence ? c : b,
          );
          code = best.code;
        } else {
          this.showNotification(
            "No Codes Found",
            "No referral codes detected on this page.",
          );
          return;
        }
      } catch {
        this.showNotification(
          "Error",
          "Could not scan page. Try using the popup instead.",
        );
        return;
      }
    }
    try {
      await this.submitToAPI({
        code,
        url,
        domain: new URL(url).hostname,
        title,
        source: "extension_context_menu",
        confidence: 0.9,
      });
      this.showNotification("Success!", `Captured referral code: ${code}`);
      this.updateBadge(tab.id, 1);
    } catch (e) {
      this.showNotification("Capture Failed", e.message);
    }
  }
  setupCommandListener() {
    chrome.commands.onCommand.addListener(async (cmd) => {
      if (cmd === "quick-capture") {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab) this.handleQuickCapture(tab);
      }
    });
  }
  async handleQuickCapture(tab) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, {
        action: "getDetections",
      });
      if (r?.referrals?.length > 0) {
        const best = r.referrals.reduce((b, c) =>
          c.confidence > b.confidence ? c : b,
        );
        await this.submitToAPI({
          code: best.code,
          url: tab.url,
          domain: new URL(tab.url).hostname,
          title: tab.title,
          source: "extension_keyboard",
          confidence: best.confidence,
        });
        this.showNotification("Quick Capture", `Captured: ${best.code}`);
      } else
        this.showNotification(
          "No Codes",
          "No referral codes found on this page",
        );
    } catch {
      this.showNotification("Error", "Could not capture from this page");
    }
  }
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      this.handleMessage(req, sender, sendResponse);
      return true;
    });
  }
  async handleMessage(req, sender, sendResponse) {
    try {
      switch (req.action) {
        case "submitToAPI": {
          const r = await this.submitToAPI(req.data);
          sendResponse(r);
          break;
        }
        case "updateBadge":
          if (sender.tab) this.updateBadge(sender.tab.id, req.count);
          sendResponse({ success: true });
          break;
        case "getSettings":
          await this.loadSettings();
          sendResponse({ apiEndpoint: this.apiBaseUrl });
          break;
        case "updateSettings":
          if (req.apiEndpoint) {
            this.apiBaseUrl = req.apiEndpoint;
            await chrome.storage.sync.set({ apiEndpoint: this.apiBaseUrl });
          }
          sendResponse({ success: true });
          break;
        case "getDealFeed": {
          const d = await chrome.storage.local.get([K_META, K_LAST, K_NEW]);
          sendResponse({
            meta: d[K_META] || null,
            lastPoll: d[K_LAST] || null,
            newCount: d[K_NEW] || 0,
          });
          break;
        }
        case "clearDealBadge":
          await chrome.storage.local.set({ [K_NEW]: 0 });
          this.updateGlobalBadge(0);
          sendResponse({ success: true });
          break;
        case "triggerPoll":
          await this.pollDeals();
          sendResponse({ success: true });
          break;
        case "syncStats":
          await this.syncCaptureStats();
          sendResponse({ success: true });
          break;
        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  setupTabListeners() {
    chrome.tabs.onActivated.addListener((a) =>
      chrome.action.setBadgeText({ text: "", tabId: a.tabId }),
    );
    chrome.tabs.onUpdated.addListener((tabId, c) => {
      if (c.status === "loading")
        chrome.action.setBadgeText({ text: "", tabId });
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
  async submitToAPI(data) {
    const payload = {
      code: data.code,
      url: data.url,
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
      const resp = await fetch(`${this.apiBaseUrl}/api/referrals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Extension-Version": "1.0.0",
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const ed = await resp.json().catch(() => ({}));
        if (resp.status === 409)
          throw new Error("This referral code already exists");
        if (resp.status === 400)
          throw new Error(ed.message || "Invalid referral data");
        if (resp.status === 500)
          throw new Error("Server error. Please try again later.");
        throw new Error(ed.message || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      if (result.referral?.url)
        console.log("API returned complete URL:", result.referral.url);
      setTimeout(() => this.syncCaptureStats(), 500);
      return { success: true, referral: result.referral };
    } catch (e) {
      console.error("API submission error:", e);
      throw e;
    }
  }
  isValidCode(c) {
    return c && c.length >= 4 && c.length <= 20 && /^[A-Z0-9]+$/i.test(c);
  }
  extractCodeFromUrl(url) {
    try {
      const m = url.match(
        /\/(?:invite|referral|ref|join|promo|freunde-rabatt|app)\/([A-Z0-9]{4,20})/i,
      );
      if (m) return m[1].toUpperCase();
      const u = new URL(url);
      const keys = ["ref", "referral", "invite", "rcode", "promo", "code"];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v && this.isValidCode(v)) return v.toUpperCase();
      }
    } catch {}
    return null;
  }
  showNotification(title, message) {
    if (chrome.notifications)
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title,
        message,
      });
    else console.log(`[Notification] ${title}: ${message}`);
  }
}
const service = new ExtensionService();
self.addEventListener("install", () => {
  console.log("Referral Capture service worker installed");
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  console.log("Referral Capture service worker activated");
  event.waitUntil(self.clients.claim());
});
