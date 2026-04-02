/**
 * Referral Capture - Content Script
 *
 * Auto-detects referral codes on web pages and provides capture functionality.
 * CRITICAL: Always preserves complete URLs (e.g., https://picnic.app/de/freunde-rabatt/DOMI6869)
 */

(function () {
  "use strict";

  // ============================================================================
  // Detection Patterns
  // ============================================================================

  const URL_PATTERNS = [
    // Path-based patterns
    {
      regex: /\/invite\/([A-Z0-9]{4,20})/i,
      type: "path_invite",
      confidence: 0.95,
    },
    {
      regex: /\/referral\/([A-Z0-9]{4,20})/i,
      type: "path_referral",
      confidence: 0.95,
    },
    { regex: /\/ref\/([A-Z0-9]{4,20})/i, type: "path_ref", confidence: 0.9 },
    { regex: /\/join\/([A-Z0-9]{4,20})/i, type: "path_join", confidence: 0.9 },
    {
      regex: /\/promo\/([A-Z0-9]{4,20})/i,
      type: "path_promo",
      confidence: 0.85,
    },
    {
      regex: /\/freunde-rabatt\/([A-Z0-9]{4,20})/i,
      type: "path_german_invite",
      confidence: 0.95,
    },
    { regex: /\/app\/([A-Z0-9]{4,20})/i, type: "path_app", confidence: 0.8 },
  ];

  const PARAM_KEYS = [
    "ref",
    "referral",
    "invite",
    "rcode",
    "promo",
    "code",
    "aff",
  ];

  const DOM_SELECTORS = [
    "[data-referral-code]",
    "[data-ref-code]",
    "[data-invite-code]",
    ".referral-code",
    ".invite-code",
    ".ref-code",
    ".promo-code",
    ".share-code",
    '[class*="referral"] code',
    '[class*="invite"] code',
    'input[name*="referral"]',
    'input[name*="invite"]',
    'input[name*="code"]',
  ];

  const TEXT_PATTERNS = [
    {
      regex:
        /(?:your|my)\s+(?:referral|invite)\s+(?:code|link)\s*(?:is|:)?\s*[:\s]*([A-Z0-9]{4,20})/gi,
      confidence: 0.95,
    },
    {
      regex: /(?:referral|invite|promo)\s+code\s*[:\s]*([A-Z0-9]{4,20})/gi,
      confidence: 0.9,
    },
    {
      regex: /use\s+(?:code|my code)\s+["']?([A-Z0-9]{4,20})["']?/gi,
      confidence: 0.85,
    },
    {
      regex: /sign\s+up\s+(?:with|using)\s+["']?([A-Z0-9]{4,20})["']?/gi,
      confidence: 0.75,
    },
  ];

  // ============================================================================
  // Referral Detector Class
  // ============================================================================

  class ReferralDetector {
    constructor() {
      this.detectedReferrals = [];
      this.scanTimeout = null;
      this.widget = null;
      this.init();
    }

    init() {
      this.scanPage();
      this.setupMutationObserver();
    }

    // ============================================================================
    // Primary Detection Method
    // ============================================================================

    scanPage() {
      const detections = [
        ...this.detectFromURL(),
        ...this.detectFromDOM(),
        ...this.detectFromText(),
      ];

      this.detectedReferrals = this.deduplicateDetections(detections);

      // Update badge with count
      this.updateBadge();

      return this.detectedReferrals;
    }

    // ============================================================================
    // URL Pattern Detection
    // ============================================================================

    detectFromURL() {
      const findings = [];
      const url = window.location.href;

      // Check path patterns
      for (const { regex, type, confidence } of URL_PATTERNS) {
        const match = url.match(regex);
        if (match) {
          findings.push({
            code: match[1].toUpperCase(),
            source: "url_path",
            pattern: type,
            confidence: confidence,
            url: url, // CRITICAL: Complete URL preserved
            domain: window.location.hostname,
          });
        }
      }

      // Check query parameters
      const params = new URLSearchParams(window.location.search);
      for (const key of PARAM_KEYS) {
        const value = params.get(key);
        if (value && value.length >= 4 && /^[A-Z0-9]+$/i.test(value)) {
          findings.push({
            code: value.toUpperCase(),
            source: "url_param",
            param: key,
            confidence: 0.85,
            url: url, // CRITICAL: Complete URL preserved
            domain: window.location.hostname,
          });
        }
      }

      return findings;
    }

    // ============================================================================
    // DOM Element Detection
    // ============================================================================

    detectFromDOM() {
      const findings = [];

      for (const selector of DOM_SELECTORS) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            const code = this.extractCodeFromElement(el);
            if (code) {
              findings.push({
                code: code.toUpperCase(),
                source: "dom_element",
                selector: selector,
                confidence: 0.8,
                url: window.location.href, // CRITICAL: Complete URL preserved
                domain: window.location.hostname,
                context: this.getElementContext(el),
              });
            }
          });
        } catch (e) {
          // Skip invalid selectors
        }
      }

      return findings;
    }

    // ============================================================================
    // Text Pattern Detection
    // ============================================================================

    detectFromText() {
      const findings = [];

      // Only scan visible text content
      const textContent = document.body?.innerText || "";

      for (const { regex, confidence } of TEXT_PATTERNS) {
        let match;
        const localRegex = new RegExp(regex.source, regex.flags);
        while ((match = localRegex.exec(textContent)) !== null) {
          findings.push({
            code: match[1].toUpperCase(),
            source: "text_pattern",
            confidence: confidence,
            url: window.location.href, // CRITICAL: Complete URL preserved
            domain: window.location.hostname,
            context: match[0].substring(0, 100),
          });
        }
      }

      return findings;
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    extractCodeFromElement(element) {
      const possibleValues = [
        element.textContent?.trim(),
        element.value?.trim(),
        element.getAttribute("data-referral-code"),
        element.getAttribute("data-ref-code"),
        element.getAttribute("data-invite-code"),
        element.getAttribute("value"),
      ].filter(Boolean);

      for (const value of possibleValues) {
        if (this.isValidCode(value)) {
          return value;
        }
      }
      return null;
    }

    isValidCode(code) {
      return (
        code &&
        code.length >= 4 &&
        code.length <= 20 &&
        /^[A-Z0-9]+$/i.test(code) &&
        !/^(http|www|html|body|div|span)$/i.test(code)
      );
    }

    getElementContext(element) {
      const parent = element.closest(
        '[class*="referral"], [class*="invite"], section, article, .card, .box',
      );
      if (parent) {
        return parent.textContent?.substring(0, 200);
      }
      return element.parentElement?.textContent?.substring(0, 100);
    }

    deduplicateDetections(detections) {
      const seen = new Map();

      for (const d of detections) {
        const key = d.code.toUpperCase();
        if (!seen.has(key) || seen.get(key).confidence < d.confidence) {
          seen.set(key, d);
        }
      }

      return Array.from(seen.values());
    }

    // ============================================================================
    // Mutation Observer for Dynamic Content
    // ============================================================================

    setupMutationObserver() {
      if (!document.body) return;

      const observer = new MutationObserver((mutations) => {
        let shouldRescan = false;

        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (this.containsReferralKeywords(node)) {
                  shouldRescan = true;
                  break;
                }
              }
            }
          }
        }

        if (shouldRescan) {
          this.debounceScan();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    containsReferralKeywords(node) {
      const text = node.textContent?.toLowerCase() || "";
      const keywords = [
        "referral",
        "invite",
        "code",
        "promo",
        "bonus",
        "freunde",
      ];
      return keywords.some((kw) => text.includes(kw));
    }

    debounceScan() {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = setTimeout(() => this.scanPage(), 500);
    }

    // ============================================================================
    // Badge Update
    // ============================================================================

    updateBadge() {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime
          .sendMessage({
            action: "updateBadge",
            count: this.detectedReferrals.length,
          })
          .catch(() => {});
      }
    }

    // ============================================================================
    // Reward Detection
    // ============================================================================

    detectRewards() {
      const rewards = [];
      const textContent = document.body?.innerText || "";

      const rewardPatterns = [
        { regex: /get\s+([£$€]\d+(?:\.\d{2})?)/gi, type: "cash" },
        {
          regex: /([£$€]\d+(?:\.\d{2})?)\s+(?:bonus|credit|reward)/gi,
          type: "credit",
        },
        { regex: /(\d{1,3})%\s+(?:off|discount)/gi, type: "percent" },
        {
          regex: /free\s+\w+\s+(?:worth|valued at)\s+([£$€]\d+)/gi,
          type: "item",
        },
      ];

      for (const { regex, type } of rewardPatterns) {
        let match;
        const localRegex = new RegExp(regex.source, regex.flags);
        while ((match = localRegex.exec(textContent)) !== null) {
          rewards.push({
            value: match[1],
            type: type,
            context: match[0],
          });
        }
      }

      return rewards;
    }

    // ============================================================================
    // Get All Detections with Metadata
    // ============================================================================

    getDetections() {
      return {
        referrals: this.detectedReferrals,
        rewards: this.detectRewards(),
        pageTitle: document.title,
        pageUrl: window.location.href, // CRITICAL: Complete URL
        domain: window.location.hostname,
      };
    }
  }

  // ============================================================================
  // Initialize Detector
  // ============================================================================

  const detector = new ReferralDetector();

  // ============================================================================
  // Message Handler
  // ============================================================================

  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "getDetections") {
        const detections = detector.getDetections();
        sendResponse(detections);
        return true;
      }

      if (request.action === "rescan") {
        const detections = detector.scanPage();
        sendResponse({ success: true, count: detections.length });
        return true;
      }

      if (request.action === "captureReferral") {
        // Forward to background script for API submission
        chrome.runtime
          .sendMessage({
            action: "submitToAPI",
            data: request.data,
          })
          .then((response) => {
            sendResponse(response);
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        return true;
      }

      return false;
    });
  }

  // Expose for testing
  window.__referralDetector = detector;
})();
