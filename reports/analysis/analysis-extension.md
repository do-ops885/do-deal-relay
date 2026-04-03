# Browser Extension Design: Referral Code Capture

**Version**: 0.1.0  
**Date**: 2025-04-01  
**Status**: Design Phase  
**Target Browsers**: Chrome, Firefox, Safari (MV3 compatible)

---

## 1. Executive Summary

This document outlines the design for a seamless browser extension that captures referral codes from any webpage with minimal user friction. The extension integrates with the do-deal-relay Cloudflare Worker API to store and manage discovered referral codes.

### Key Value Propositions

- **Zero-friction capture**: One-click or automatic capture without leaving the page
- **Smart detection**: AI-like pattern recognition for referral codes across sites
- **Contextual awareness**: Captures not just codes but rewards, terms, and metadata
- **Cross-browser**: Single codebase supporting Chrome, Firefox, and Safari

---

## 2. Extension Architecture (Manifest V3)

### 2.1 Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "Referral Capture",
  "version": "0.1.0",
  "description": "One-click capture and auto-detection of referral codes from any webpage",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus",
    "scripting",
    "history"
  ],
  "optional_permissions": [
    "clipboardRead",
    "clipboardWrite"
  ],
  "host_permissions": [
    "http://*/",
    "https://*/"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "Capture Referral Code"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["injected.js", "icons/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "commands": {
    "quick-capture": {
      "suggested_key": {
        "default": "Ctrl+Shift+R",
        "mac": "Command+Shift+R"
      },
      "description": "Quick capture referral code from current page"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### 2.2 Firefox-Specific Manifest (v2 compatibility wrapper)

```json
{
  "manifest_version": 2,
  "name": "Referral Capture",
  "version": "0.1.0",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus",
    "clipboardRead",
    "clipboardWrite",
    "http://*/",
    "https://*/"
  ],
  "background": {
    "scripts": ["background.js"],
    "persistent": false
  },
  "browser_action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ]
}
```

---

## 3. Component Architecture

### 3.1 Service Worker (background.js)

**Responsibilities**:
- Context menu registration and handling
- API communication with backend
- Cross-tab state management
- History scanning for bulk import
- Badge icon updates

```javascript
// background.js - Service Worker Architecture

class ExtensionService {
  constructor() {
    this.apiBaseUrl = 'https://your-worker.workers.dev';
    this.init();
  }

  init() {
    this.setupContextMenus();
    this.setupCommandListener();
    this.setupTabListeners();
    this.setupMessageHandlers();
  }

  // Context Menu Integration
  setupContextMenus() {
    chrome.contextMenus.create({
      id: 'capture-referral',
      title: 'Capture Referral Code',
      contexts: ['page', 'selection', 'link']
    });

    chrome.contextMenus.create({
      id: 'capture-selection',
      title: 'Capture as Referral Code',
      contexts: ['selection']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  // Keyboard shortcut handler
  setupCommandListener() {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'quick-capture') {
        this.quickCapture();
      }
    });
  }

  // Message passing from content/popup
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep channel open for async
    });
  }

  // API Integration
  async submitToAPI(data) {
    const response = await fetch(`${this.apiBaseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: data.url,
        code: data.code,
        source: data.domain,
        metadata: {
          title: data.title,
          description: data.description,
          reward_type: data.rewardType,
          reward_value: data.rewardValue,
          detected_by: 'browser_extension',
          detected_at: new Date().toISOString()
        }
      })
    });
    return response.json();
  }

  // Bulk import from history
  async scanHistory(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const historyItems = await chrome.history.search({
      text: '',
      startTime: cutoff,
      maxResults: 1000
    });

    const candidates = historyItems.filter(item => 
      this.isReferralUrl(item.url)
    );

    return this.processBatch(candidates);
  }

  isReferralUrl(url) {
    const patterns = [
      /\/invite\//i,
      /\/referral\//i,
      /[?&]ref[=\w]/i,
      /[?&]invite[=\w]/i,
      /\/ref\//i
    ];
    return patterns.some(p => p.test(url));
  }
}

const service = new ExtensionService();
```

### 3.2 Content Script (content.js)

**Responsibilities**:
- DOM scanning for referral patterns
- Visual highlighting of detected codes
- Floating capture widget injection
- Selection-based capture
- Page metadata extraction

```javascript
// content.js - Auto-detection & Capture UI

class ReferralDetector {
  constructor() {
    this.detectedReferrals = [];
    this.highlights = [];
    this.init();
  }

  init() {
    this.scanPage();
    this.setupMutationObserver();
    this.injectFloatingWidget();
  }

  // Primary Detection Algorithm
  scanPage() {
    const detections = [
      ...this.detectFromURL(),
      ...this.detectFromDOM(),
      ...this.detectFromMeta(),
      ...this.detectFromPatterns()
    ];

    this.detectedReferrals = this.deduplicateDetections(detections);
    this.updateUI();
    return this.detectedReferrals;
  }

  // Pattern 1: URL Analysis
  detectFromURL() {
    const url = window.location.href;
    const findings = [];

    // Pattern: /invite/CODE or /referral/CODE
    const pathPatterns = [
      { regex: /\/invite\/([A-Z0-9]{6,16})/i, type: 'path_invite' },
      { regex: /\/referral\/([A-Z0-9]{6,16})/i, type: 'path_referral' },
      { regex: /\/ref\/([A-Z0-9]{6,16})/i, type: 'path_ref' },
      { regex: /\/join\/([A-Z0-9]{6,16})/i, type: 'path_join' },
    ];

    for (const { regex, type } of pathPatterns) {
      const match = url.match(regex);
      if (match) {
        findings.push({
          code: match[1].toUpperCase(),
          source: 'url_path',
          pattern: type,
          confidence: 0.9,
          url: url
        });
      }
    }

    // Pattern: Query parameters
    const params = new URLSearchParams(window.location.search);
    const paramKeys = ['ref', 'referral', 'invite', 'rcode', 'promo'];
    
    for (const key of paramKeys) {
      const value = params.get(key);
      if (value && value.length >= 4) {
        findings.push({
          code: value.toUpperCase(),
          source: 'url_param',
          param: key,
          confidence: 0.85,
          url: url
        });
      }
    }

    return findings;
  }

  // Pattern 2: DOM Element Detection
  detectFromDOM() {
    const findings = [];
    
    // Selector patterns for common referral UI elements
    const selectors = [
      '[data-referral-code]',
      '[data-ref-code]',
      '.referral-code',
      '.invite-code',
      '.ref-code',
      '[class*="referral"] code',
      '[class*="invite"] code',
      'input[value*="invite"]',
      'input[value*="referral"]',
      '.share-code',
      '.invite-link'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const code = this.extractCodeFromElement(el);
        if (code) {
          findings.push({
            code: code.toUpperCase(),
            source: 'dom_element',
            selector: selector,
            element: el.tagName,
            confidence: 0.8,
            url: window.location.href,
            context: this.getElementContext(el)
          });
        }
      });
    }

    return findings;
  }

  // Pattern 3: Meta Tags and Open Graph
  detectFromMeta() {
    const findings = [];
    
    const metaTags = [
      'meta[property="og:referral"]',
      'meta[name="referral-code"]',
      'meta[name="invite-code"]'
    ];

    for (const selector of metaTags) {
      const meta = document.querySelector(selector);
      if (meta) {
        const content = meta.getAttribute('content');
        if (content && content.length >= 4) {
          findings.push({
            code: content.toUpperCase(),
            source: 'meta_tag',
            confidence: 0.75,
            url: window.location.href
          });
        }
      }
    }

    return findings;
  }

  // Pattern 4: Text Pattern Matching
  detectFromPatterns() {
    const findings = [];
    const textContent = document.body.innerText;
    
    // Regex patterns for referral code discovery
    const patterns = [
      // "Your referral code is: XXXXXX"
      { 
        regex: /(?:your|my)\s+(?:referral|invite)\s+(?:code|link)\s*(?:is|:)?\s*[:\s]*([A-Z0-9]{6,16})/gi,
        confidence: 0.9
      },
      // "Code: XXXXXX" near referral keywords
      {
        regex: /(?:referral|invite|promo)\s+code\s*[:\s]*([A-Z0-9]{6,16})/gi,
        confidence: 0.85
      },
      // "Use code XXXXXX"
      {
        regex: /use\s+(?:code|my code)\s+["']?([A-Z0-9]{6,16})["']?/gi,
        confidence: 0.8
      },
      // "Sign up with XXXXXX"
      {
        regex: /sign\s+up\s+(?:with|using)\s+["']?([A-Z0-9]{6,16})["']?/gi,
        confidence: 0.7
      }
    ];

    for (const { regex, confidence } of patterns) {
      let match;
      while ((match = regex.exec(textContent)) !== null) {
        findings.push({
          code: match[1].toUpperCase(),
          source: 'text_pattern',
          confidence: confidence,
          url: window.location.href,
          context: match[0].substring(0, 50)
        });
      }
    }

    return findings;
  }

  // Reward Detection
  detectRewards() {
    const rewards = [];
    const textContent = document.body.innerText;
    
    // Reward patterns
    const rewardPatterns = [
      // "Get £XX" / "Get $XX"
      { 
        regex: /get\s+([£$€]\d+(?:\.\d{2})?)/gi,
        type: 'cash'
      },
      // "£XX bonus" / "$XX credit"
      {
        regex: /([£$€]\d+(?:\.\d{2})?)\s+(?:bonus|credit|reward)/gi,
        type: 'credit'
      },
      // "XX% off"
      {
        regex: /(\d{1,3})%\s+(?:off|discount)/gi,
        type: 'percent'
      },
      // "Free share worth £XX"
      {
        regex: /free\s+\w+\s+(?:worth|valued at)\s+([£$€]\d+)/gi,
        type: 'item'
      }
    ];

    for (const { regex, type } of rewardPatterns) {
      let match;
      while ((match = regex.exec(textContent)) !== null) {
        rewards.push({
          value: match[1],
          type: type,
          context: match[0]
        });
      }
    }

    return rewards;
  }

  // Helper: Extract code from element
  extractCodeFromElement(element) {
    const code = element.textContent?.trim() || 
                 element.value?.trim() || 
                 element.getAttribute('data-referral-code') ||
                 element.getAttribute('data-ref-code');
    
    // Validate: min 4 chars, alphanumeric, no spaces
    if (code && code.length >= 4 && /^[A-Z0-9]+$/i.test(code)) {
      return code;
    }
    return null;
  }

  // Helper: Get surrounding context
  getElementContext(element) {
    const parent = element.closest('[class*="referral"], [class*="invite"], section, article, .card, .box');
    if (parent) {
      return parent.textContent?.substring(0, 200);
    }
    return null;
  }

  // Deduplicate detections
  deduplicateDetections(detections) {
    const seen = new Map();
    
    for (const d of detections) {
      const key = `${d.code}-${d.source}`;
      if (!seen.has(key) || seen.get(key).confidence < d.confidence) {
        seen.set(key, d);
      }
    }
    
    return Array.from(seen.values());
  }

  // Mutation Observer for dynamic content
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if added node contains referral-related content
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
      subtree: true
    });
  }

  containsReferralKeywords(node) {
    const text = node.textContent?.toLowerCase() || '';
    const keywords = ['referral', 'invite', 'code', 'promo', 'bonus'];
    return keywords.some(kw => text.includes(kw));
  }

  debounceScan() {
    clearTimeout(this.scanTimeout);
    this.scanTimeout = setTimeout(() => this.scanPage(), 500);
  }
}

// Initialize detector
const detector = new ReferralDetector();
```

### 3.3 Floating Capture Widget (UI Overlay)

```javascript
// floating-widget.js - In-page quick capture UI

class FloatingWidget {
  constructor(detector) {
    this.detector = detector;
    this.widget = null;
    this.init();
  }

  init() {
    this.injectStyles();
    this.createWidget();
    this.setupDragHandling();
  }

  injectStyles() {
    const styles = `
      .ref-capture-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 999999;
        overflow: hidden;
        transition: transform 0.2s, opacity 0.2s;
      }
      
      .ref-capture-widget.dragging {
        opacity: 0.8;
        transform: scale(1.02);
      }
      
      .ref-capture-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
      }
      
      .ref-capture-title {
        font-weight: 600;
        font-size: 14px;
      }
      
      .ref-capture-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background 0.2s;
      }
      
      .ref-capture-close:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .ref-capture-body {
        padding: 16px;
      }
      
      .ref-detection-item {
        background: #f7fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .ref-detection-item:hover {
        border-color: #667eea;
        background: #edf2f7;
      }
      
      .ref-detection-item.selected {
        border-color: #667eea;
        background: #e6fffa;
      }
      
      .ref-code-display {
        font-family: 'Courier New', monospace;
        font-size: 16px;
        font-weight: 600;
        color: #2d3748;
        letter-spacing: 0.5px;
      }
      
      .ref-source-badge {
        display: inline-block;
        font-size: 10px;
        padding: 2px 6px;
        background: #cbd5e0;
        color: #4a5568;
        border-radius: 4px;
        margin-top: 4px;
        text-transform: uppercase;
      }
      
      .ref-confidence {
        float: right;
        font-size: 11px;
        color: #48bb78;
      }
      
      .ref-capture-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      
      .ref-btn {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .ref-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      
      .ref-btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      .ref-btn-secondary {
        background: #edf2f7;
        color: #4a5568;
      }
      
      .ref-btn-secondary:hover {
        background: #e2e8f0;
      }
      
      .ref-empty-state {
        text-align: center;
        padding: 20px;
        color: #a0aec0;
      }
      
      .ref-manual-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        margin-top: 8px;
      }
      
      .ref-manual-input:focus {
        outline: none;
        border-color: #667eea;
      }
      
      @keyframes ref-slideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .ref-capture-widget {
        animation: ref-slideIn 0.3s ease-out;
      }
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  createWidget() {
    this.widget = document.createElement('div');
    this.widget.className = 'ref-capture-widget';
    this.widget.innerHTML = `
      <div class="ref-capture-header">
        <span class="ref-capture-title">🎁 Referral Codes Detected</span>
        <button class="ref-capture-close">×</button>
      </div>
      <div class="ref-capture-body">
        <div id="ref-detections-list"></div>
        <div class="ref-capture-actions">
          <button class="ref-btn ref-btn-secondary" id="ref-manual-btn">Manual</button>
          <button class="ref-btn ref-btn-primary" id="ref-capture-btn">Capture</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.widget);
    
    // Event listeners
    this.widget.querySelector('.ref-capture-close').addEventListener('click', () => {
      this.hide();
    });
    
    this.widget.querySelector('#ref-capture-btn').addEventListener('click', () => {
      this.captureSelected();
    });
    
    this.updateDetections();
  }

  updateDetections() {
    const detections = this.detector.detectedReferrals;
    const list = this.widget.querySelector('#ref-detections-list');
    
    if (detections.length === 0) {
      list.innerHTML = `
        <div class="ref-empty-state">
          <p>No referral codes detected on this page</p>
          <input type="text" class="ref-manual-input" placeholder="Enter code manually...">
        </div>
      `;
    } else {
      list.innerHTML = detections.map((d, i) => `
        <div class="ref-detection-item" data-index="${i}">
          <div class="ref-code-display">${d.code}</div>
          <span class="ref-source-badge">${d.source}</span>
          <span class="ref-confidence">${Math.round(d.confidence * 100)}% match</span>
        </div>
      `).join('');
      
      // Selection handling
      list.querySelectorAll('.ref-detection-item').forEach(item => {
        item.addEventListener('click', () => {
          list.querySelectorAll('.ref-detection-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
        });
      });
    }
  }

  captureSelected() {
    const selected = this.widget.querySelector('.ref-detection-item.selected');
    if (selected) {
      const index = parseInt(selected.dataset.index);
      const detection = this.detector.detectedReferrals[index];
      
      // Send to background script
      chrome.runtime.sendMessage({
        action: 'captureReferral',
        data: {
          code: detection.code,
          url: window.location.href,
          domain: window.location.hostname,
          title: document.title,
          detected: detection
        }
      });
      
      // Show success feedback
      selected.style.background = '#c6f6d5';
      selected.innerHTML += '<div style="color: #22543d; margin-top: 8px;">✓ Captured!</div>';
      
      setTimeout(() => this.hide(), 1500);
    }
  }

  show() {
    this.widget.style.display = 'block';
  }

  hide() {
    this.widget.style.display = 'none';
  }

  setupDragHandling() {
    const header = this.widget.querySelector('.ref-capture-header');
    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = this.widget.offsetLeft;
      initialY = this.widget.offsetTop;
      this.widget.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      this.widget.style.left = `${initialX + dx}px`;
      this.widget.style.top = `${initialY + dy}px`;
      this.widget.style.bottom = 'auto';
      this.widget.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      this.widget.classList.remove('dragging');
    });
  }
}
```

---

## 4. Popup UI Design

### 4.1 Popup Structure (popup.html)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: 360px;
      min-height: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f7fafc;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
    }
    
    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }
    
    .header .subtitle {
      font-size: 12px;
      opacity: 0.9;
      margin-top: 2px;
    }
    
    .content {
      padding: 16px;
    }
    
    .section {
      background: white;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    
    .current-page {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .favicon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: #edf2f7;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .page-info {
      flex: 1;
      min-width: 0;
    }
    
    .page-title {
      font-size: 14px;
      font-weight: 600;
      color: #2d3748;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .page-url {
      font-size: 12px;
      color: #a0aec0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .scan-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 10px;
      background: #f7fafc;
      border-radius: 6px;
    }
    
    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .status-indicator.found {
      background: #48bb78;
      box-shadow: 0 0 0 3px rgba(72, 187, 120, 0.3);
    }
    
    .status-indicator.none {
      background: #a0aec0;
    }
    
    .status-text {
      font-size: 13px;
      color: #4a5568;
    }
    
    .detection-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .detection-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px;
      background: #f7fafc;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .detection-item:hover {
      border-color: #667eea;
      background: #edf2f7;
    }
    
    .detection-item.selected {
      border-color: #667eea;
      background: #e6fffa;
    }
    
    .code-value {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #2d3748;
    }
    
    .confidence {
      font-size: 11px;
      color: #48bb78;
    }
    
    .btn {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    
    .btn-secondary {
      background: #edf2f7;
      color: #4a5568;
    }
    
    .btn-secondary:hover {
      background: #e2e8f0;
    }
    
    .manual-input {
      width: 100%;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
      margin-bottom: 10px;
    }
    
    .manual-input:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    
    .stat-item {
      text-align: center;
    }
    
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #667eea;
    }
    
    .stat-label {
      font-size: 11px;
      color: #718096;
      margin-top: 2px;
    }
    
    .footer {
      padding: 12px 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .footer-link {
      font-size: 12px;
      color: #667eea;
      text-decoration: none;
    }
    
    .footer-link:hover {
      text-decoration: underline;
    }
    
    .settings-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: #a0aec0;
    }
    
    .settings-btn:hover {
      color: #667eea;
    }
    
    /* Toast notification */
    .toast {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #2d3748;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 13px;
      opacity: 0;
      transition: all 0.3s;
      z-index: 10000;
    }
    
    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    
    .toast.success {
      background: #48bb78;
    }
    
    .toast.error {
      background: #f56565;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎁 Referral Capture</h1>
    <div class="subtitle">One-click code capture</div>
  </div>
  
  <div class="content">
    <!-- Current Page Section -->
    <div class="section">
      <div class="current-page">
        <div class="favicon" id="favicon">📄</div>
        <div class="page-info">
          <div class="page-title" id="page-title">Loading...</div>
          <div class="page-url" id="page-url">...</div>
        </div>
      </div>
      
      <div class="scan-status" id="scan-status">
        <div class="status-indicator none"></div>
        <span class="status-text">Scanning for referral codes...</span>
      </div>
    </div>
    
    <!-- Detected Codes Section -->
    <div class="section" id="detections-section" style="display: none;">
      <div class="section-title">Detected Codes</div>
      <div class="detection-list" id="detection-list"></div>
      <button class="btn btn-primary" id="capture-btn" style="margin-top: 12px;">
        Capture Selected
      </button>
    </div>
    
    <!-- Manual Entry Section -->
    <div class="section">
      <div class="section-title">Manual Entry</div>
      <input type="text" class="manual-input" id="manual-code" 
             placeholder="Enter referral code...">
      <button class="btn btn-secondary" id="manual-btn">Add Code</button>
    </div>
    
    <!-- Stats Section -->
    <div class="section">
      <div class="section-title">Your Stats</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value" id="stat-captured">0</div>
          <div class="stat-label">Captured</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-submitted">0</div>
          <div class="stat-label">Submitted</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="stat-points">0</div>
          <div class="stat-label">Points</div>
        </div>
      </div>
    </div>
  </div>
  
  <div class="footer">
    <a href="#" class="footer-link" id="history-link">View History</a>
    <button class="settings-btn" id="settings-btn">⚙️</button>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script src="popup.js"></script>
</body>
</html>
```

### 4.2 Popup Logic (popup.js)

```javascript
// popup.js - Popup UI controller

document.addEventListener('DOMContentLoaded', async () => {
  const state = {
    currentTab: null,
    detections: [],
    selectedDetection: null
  };

  // Initialize
  await init();

  async function init() {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.currentTab = tab;
    
    // Update page info
    updatePageInfo(tab);
    
    // Request detections from content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getDetections' });
    
    if (response && response.detections.length > 0) {
      state.detections = response.detections;
      showDetections(response.detections);
    } else {
      showNoDetections();
    }
    
    // Load stats
    loadStats();
    
    // Setup event listeners
    setupEventListeners();
  }

  function updatePageInfo(tab) {
    document.getElementById('page-title').textContent = tab.title || 'Unknown';
    document.getElementById('page-url').textContent = new URL(tab.url).hostname;
    
    // Try to get favicon
    if (tab.favIconUrl) {
      document.getElementById('favicon').innerHTML = 
        `<img src="${tab.favIconUrl}" width="24" height="24">`;
    }
  }

  function showDetections(detections) {
    const section = document.getElementById('detections-section');
    const list = document.getElementById('detection-list');
    const status = document.getElementById('scan-status');
    
    section.style.display = 'block';
    status.innerHTML = `
      <div class="status-indicator found"></div>
      <span class="status-text">${detections.length} referral code${detections.length > 1 ? 's' : ''} found</span>
    `;
    
    list.innerHTML = detections.map((d, i) => `
      <div class="detection-item" data-index="${i}">
        <span class="code-value">${d.code}</span>
        <span class="confidence">${Math.round(d.confidence * 100)}%</span>
      </div>
    `).join('');
    
    // Selection handling
    list.querySelectorAll('.detection-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.detection-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        state.selectedDetection = detections[parseInt(item.dataset.index)];
      });
    });
    
    // Auto-select first
    if (detections.length > 0) {
      list.querySelector('.detection-item').classList.add('selected');
      state.selectedDetection = detections[0];
    }
  }

  function showNoDetections() {
    const status = document.getElementById('scan-status');
    status.innerHTML = `
      <div class="status-indicator none"></div>
      <span class="status-text">No referral codes detected on this page</span>
    `;
  }

  function setupEventListeners() {
    // Capture button
    document.getElementById('capture-btn').addEventListener('click', async () => {
      if (!state.selectedDetection) return;
      
      try {
        await captureReferral(state.selectedDetection);
        showToast('Referral code captured!', 'success');
        incrementStat('captured');
      } catch (err) {
        showToast('Failed to capture: ' + err.message, 'error');
      }
    });
    
    // Manual entry
    document.getElementById('manual-btn').addEventListener('click', async () => {
      const code = document.getElementById('manual-code').value.trim();
      if (!code) return;
      
      await captureReferral({
        code,
        url: state.currentTab.url,
        domain: new URL(state.currentTab.url).hostname,
        source: 'manual'
      });
      
      showToast('Code added manually!', 'success');
      document.getElementById('manual-code').value = '';
      incrementStat('captured');
    });
    
    // History link
    document.getElementById('history-link').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    });
    
    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
  }

  async function captureReferral(detection) {
    const response = await chrome.runtime.sendMessage({
      action: 'captureReferral',
      data: {
        code: detection.code,
        url: state.currentTab.url,
        domain: new URL(state.currentTab.url).hostname,
        title: state.currentTab.title,
        detected: detection
      }
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Unknown error');
    }
    
    return response;
  }

  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  async function loadStats() {
    const stats = await chrome.storage.local.get(['captured', 'submitted', 'points']);
    document.getElementById('stat-captured').textContent = stats.captured || 0;
    document.getElementById('stat-submitted').textContent = stats.submitted || 0;
    document.getElementById('stat-points').textContent = stats.points || 0;
  }

  async function incrementStat(key) {
    const result = await chrome.storage.local.get([key]);
    const value = (result[key] || 0) + 1;
    await chrome.storage.local.set({ [key]: value });
    document.getElementById(`stat-${key}`).textContent = value;
  }
});
```

---

## 5. API Integration

### 5.1 API Client Module

```javascript
// api-client.js - Backend API communication

const API_BASE = 'https://your-worker.workers.dev';

class APIClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  async submitReferral(data) {
    const payload = {
      url: data.url,
      code: data.code,
      source: data.domain,
      metadata: {
        title: data.title,
        description: data.detected?.context || '',
        reward_type: this.inferRewardType(data.detected?.rewards),
        detected_by: 'browser_extension',
        detected_at: new Date().toISOString(),
        confidence: data.detected?.confidence || 0.5,
        detection_source: data.detected?.source || 'manual'
      }
    };

    const response = await fetch(`${this.baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Extension-Version': '0.1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getDeals(params = {}) {
    const query = new URLSearchParams(params);
    const response = await fetch(`${this.baseUrl}/deals?${query}`);
    return response.json();
  }

  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/status`);
    return response.json();
  }

  inferRewardType(rewards) {
    if (!rewards || rewards.length === 0) return 'unknown';
    
    // Return most common type
    const types = rewards.map(r => r.type);
    return types.sort((a, b) => 
      types.filter(t => t === a).length - types.filter(t => t === b).length
    ).pop();
  }
}

export default new APIClient();
```

---

## 6. Storage Strategy

### 6.1 Chrome Storage Usage

```javascript
// storage.js - Extension storage management

const Storage = {
  // User preferences
  async getSettings() {
    return chrome.storage.sync.get({
      autoCapture: false,
      showWidget: true,
      minConfidence: 0.7,
      excludedDomains: [],
      apiEndpoint: API_BASE
    });
  },

  async saveSettings(settings) {
    return chrome.storage.sync.set(settings);
  },

  // Captured referrals (local)
  async getCaptured() {
    const result = await chrome.storage.local.get('captured');
    return result.captured || [];
  },

  async addCaptured(referral) {
    const captured = await this.getCaptured();
    captured.unshift({
      ...referral,
      capturedAt: new Date().toISOString()
    });
    // Keep last 100
    if (captured.length > 100) captured.pop();
    return chrome.storage.local.set({ captured });
  },

  // User stats
  async incrementStat(stat) {
    const result = await chrome.storage.local.get(['stats']);
    const stats = result.stats || { captured: 0, submitted: 0, points: 0 };
    stats[stat] = (stats[stat] || 0) + 1;
    return chrome.storage.local.set({ stats });
  },

  // Sync vs Local Strategy
  // sync: user settings, preferences
  // local: captured data, temporary cache, stats
};
```

---

## 7. Bulk Import from History

### 7.1 History Scanner

```javascript
// history-scanner.js - Bulk import functionality

class HistoryScanner {
  async scan(options = {}) {
    const {
      days = 30,
      maxResults = 1000,
      onProgress = () => {}
    } = options;

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    // Get history items
    const history = await chrome.history.search({
      text: '',
      startTime: cutoff,
      maxResults
    });

    // Filter referral URLs
    const candidates = history.filter(item => 
      this.isReferralUrl(item.url)
    );

    onProgress({ stage: 'filtered', count: candidates.length });

    // Process each candidate
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      
      try {
        // Extract code from URL
        const code = this.extractCodeFromUrl(item.url);
        if (code) {
          results.push({
            code,
            url: item.url,
            domain: new URL(item.url).hostname,
            lastVisit: new Date(item.lastVisitTime).toISOString(),
            visitCount: item.visitCount,
            source: 'history'
          });
        }
      } catch (err) {
        // Skip invalid URLs
      }
      
      onProgress({
        stage: 'processing',
        current: i + 1,
        total: candidates.length
      });
    }

    return results;
  }

  isReferralUrl(url) {
    const patterns = [
      /\/invite\//i,
      /\/referral\//i,
      /[?&]ref[=\w]/i,
      /[?&]invite[=\w]/i,
      /\/ref\//i,
      /\/join\//i,
      /\/promo/i
    ];
    return patterns.some(p => p.test(url));
  }

  extractCodeFromUrl(url) {
    // Try path patterns
    const pathMatch = url.match(/\/(?:invite|referral|ref|join)\/([A-Z0-9]{4,16})/i);
    if (pathMatch) return pathMatch[1].toUpperCase();

    // Try query params
    const params = new URLSearchParams(new URL(url).search);
    for (const key of ['ref', 'referral', 'invite', 'rcode']) {
      const value = params.get(key);
      if (value && value.length >= 4) return value.toUpperCase();
    }

    return null;
  }
}
```

---

## 8. Cross-Browser Compatibility

### 8.1 Browser-Specific Adaptations

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Manifest | v3 | v2 (v3 opt-in) | v3 |
| Service Worker | ✓ | ✓ (as BG script) | ✓ |
| Context Menus | ✓ | ✓ | Partial |
| History API | ✓ | ✓ | ✗ |
| Storage Sync | ✓ | ✓ (limited) | ✓ |
| Commands | ✓ | ✓ | ✓ |

### 8.2 Polyfill Strategy

```javascript
// browser-polyfill.js

// Use browser API where available, fallback to chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Firefox-specific: Convert promises where needed
if (typeof browser !== 'undefined' && browser.runtime) {
  // Firefox already uses promises
} else if (typeof chrome !== 'undefined') {
  // Chrome uses callbacks, wrap in promises
  const promisify = (api) => {
    return new Proxy(api, {
      get(target, prop) {
        if (typeof target[prop] === 'function') {
          return (...args) => {
            return new Promise((resolve, reject) => {
              target[prop](...args, (result) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(result);
                }
              });
            });
          };
        }
        return target[prop];
      }
    });
  };
}

export default browserAPI;
```

---

## 9. Permissions Analysis

### 9.1 Required Permissions

| Permission | Purpose | Justification |
|------------|---------|---------------|
| `activeTab` | Access current page | Capture from current tab only |
| `storage` | Save user settings | Store preferences and stats |
| `contextMenus` | Right-click integration | Quick capture without popup |
| `scripting` | Inject detection scripts | Run detection on all pages |
| `history` | Bulk import | Scan past visits for referrals |

### 9.2 Optional Permissions

| Permission | Purpose | User Trigger |
|------------|---------|--------------|
| `clipboardRead` | Paste from clipboard | Manual code entry |
| `clipboardWrite` | Copy codes to share | Export functionality |
| `notifications` | Capture confirmation | User preference |

### 9.3 Host Permissions

```json
{
  "host_permissions": [
    "http://*/",
    "https://*/"
  ]
}
```

**Justification**: Required to:
- Inject content scripts on all pages for detection
- Read DOM content for referral scanning
- Access URL parameters in paths

---

## 10. Detection Pattern Reference

### 10.1 URL Patterns

```javascript
const URL_PATTERNS = [
  // Path-based
  { pattern: /\/invite\/([A-Z0-9]{6,16})/i, examples: ['trading212.com/invite/ABC123'] },
  { pattern: /\/referral\/([A-Z0-9]{6,16})/i, examples: ['airbnb.com/referral/JOHN123'] },
  { pattern: /\/ref\/([A-Z0-9]{4,12})/i, examples: ['crypto.com/ref/MIKE99'] },
  { pattern: /\/join\/([A-Z0-9]{6,16})/i, examples: ['robinhood.com/join/SARAH2024'] },
  { pattern: /\/promo\/([A-Z0-9]{4,12})/i, examples: ['uber.com/promo/RIDE50'] },
  
  // Query parameters
  { pattern: /[?&]ref=([A-Z0-9]{4,16})/i, examples: ['?ref=FRIEND1'] },
  { pattern: /[?&]referral=([A-Z0-9]{4,16})/i, examples: ['?referral=CODE2024'] },
  { pattern: /[?&]invite=([A-Z0-9]{4,16})/i, examples: ['?invite=HELLO99'] },
  { pattern: /[?&]rcode=([A-Z0-9]{4,16})/i, examples: ['?rcode=BONUS'] },
  { pattern: /[?&]promo=([A-Z0-9]{4,16})/i, examples: ['?promo=SAVE20'] }
];
```

### 10.2 DOM Selectors

```javascript
const DOM_SELECTORS = [
  // Data attributes
  '[data-referral-code]',
  '[data-ref-code]',
  '[data-invite-code]',
  '[data-promo-code]',
  
  // Class-based
  '.referral-code',
  '.invite-code',
  '.promo-code',
  '.ref-code',
  '.share-code',
  
  // Nested patterns
  '[class*="referral"] code',
  '[class*="invite"] code',
  '[class*="promo"] .code',
  
  // Input patterns
  'input[name*="referral"]',
  'input[name*="invite"]',
  'input[id*="code"]'
];
```

### 10.3 Text Patterns

```javascript
const TEXT_PATTERNS = [
  {
    name: 'your-code-is',
    regex: /(?:your|my)\s+(?:referral|invite)\s+code\s*(?:is|:)?\s*[:\s]*([A-Z0-9]{4,16})/gi,
    confidence: 0.95
  },
  {
    name: 'code-labeled',
    regex: /(?:referral|invite|promo)\s+code\s*[:\s]*([A-Z0-9]{4,16})/gi,
    confidence: 0.9
  },
  {
    name: 'use-code',
    regex: /use\s+(?:code|my code)\s+["']?([A-Z0-9]{4,16})["']?/gi,
    confidence: 0.85
  },
  {
    name: 'signup-with',
    regex: /sign\s+up\s+(?:with|using)\s+["']?([A-Z0-9]{4,16})["']?/gi,
    confidence: 0.75
  }
];
```

---

## 11. Pros and Cons Analysis

### 11.1 Advantages

| Benefit | Description |
|---------|-------------|
| **Zero Friction** | One-click capture without leaving the page |
| **Passive Detection** | Auto-detects while user browses normally |
| **Smart Recognition** | Multiple detection patterns increase accuracy |
| **Contextual** | Captures reward info, terms, and metadata automatically |
| **Bulk Import** | Historical scanning captures missed opportunities |
| **Cross-Browser** | Single codebase supports Chrome, Firefox, Safari |
| **Lightweight** | Efficient DOM scanning with mutation observers |
| **Privacy-First** | Local processing, only code submitted to API |

### 11.2 Challenges and Limitations

| Challenge | Mitigation |
|-----------|------------|
| **False Positives** | Confidence scoring + manual review |
| **Dynamic Sites** | MutationObserver + periodic rescan |
| **Rate Limiting** | Queue submissions, exponential backoff |
| **Permission Concerns** | Clear onboarding explaining need for access |
| **Safari Limitations** | Some features unavailable (history API) |
| **Site-Specific Detection** | Configurable selector registry |

### 11.3 Trade-offs

| Decision | Option A | Option B | Chosen |
|----------|----------|----------|--------|
| Detection Timing | Real-time scan | On-demand only | A (with throttling) |
| UI Approach | Floating widget | Popup only | Both (configurable) |
| Auto-submit | Immediate | Queue for review | B (quality control) |
| Storage | Chrome Sync | Local only | Hybrid (settings sync, data local) |
| History Scan | Full automatic | User-triggered | User-triggered (privacy) |

---

## 12. Implementation Roadmap

### Phase 1: MVP (Week 1-2)
- [ ] Basic manifest and popup UI
- [ ] URL pattern detection
- [ ] Single code submission to API
- [ ] Basic context menu

### Phase 2: Smart Detection (Week 3-4)
- [ ] DOM selector detection
- [ ] Text pattern matching
- [ ] Floating widget
- [ ] Confidence scoring

### Phase 3: Bulk Features (Week 5-6)
- [ ] History scanner
- [ ] Batch processing UI
- [ ] Duplicate detection
- [ ] Import/export

### Phase 4: Polish (Week 7-8)
- [ ] Cross-browser testing
- [ ] Safari adaptation
- [ ] Performance optimization
- [ ] Settings panel

---

## 13. Security Considerations

1. **Code Validation**: Sanitize all codes before submission (alphanumeric only)
2. **URL Validation**: Ensure URLs are valid before processing
3. **CSP Compliance**: Extension scripts follow CSP policies
4. **Data Minimization**: Only capture referral codes, not personal data
5. **Secure Storage**: Use `chrome.storage` APIs (encrypted at rest on some platforms)
6. **API Security**: HTTPS only, validate server certificates

---

## 14. Integration Points

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submit` | POST | Submit new referral |
| `/deals` | GET | View existing deals |
| `/api/status` | GET | Check pipeline status |

### Data Flow

```
User Page Visit
    ↓
Content Script Detection
    ↓
Service Worker Processing
    ↓
API Submission (/api/submit)
    ↓
Backend Validation Pipeline
    ↓
KV Storage (DEALS_SOURCES)
```

---

## 15. Conclusion

This browser extension design provides a seamless, intelligent referral code capture experience. The multi-layered detection approach (URL, DOM, text patterns) maximizes discovery while confidence scoring minimizes false positives.

The extension architecture follows modern best practices:
- Manifest V3 for future-proofing
- Service worker for efficient background processing
- Content script isolation for security
- Clear permission model with user control

Integration with the do-deal-relay API is straightforward, leveraging the existing `/api/submit` endpoint with minimal changes required on the backend.

---

## Appendix A: File Structure

```
extension/
├── manifest.json          # Chrome MV3 manifest
├── manifest-v2.json       # Firefox compatibility
├── background.js            # Service worker
├── content.js               # Detection script
├── content.css              # Widget styles
├── popup.html               # Popup UI
├── popup.js                 # Popup logic
├── popup.css                # Popup styles
├── history.html             # History UI
├── history.js               # History logic
├── settings.html            # Settings UI
├── settings.js              # Settings logic
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── lib/
    ├── api-client.js        # API communication
    ├── detector.js          # Detection engine
    ├── storage.js           # Storage helpers
    └── browser-polyfill.js  # Cross-browser support
```

## Appendix B: Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit Tests | Detection patterns, URL parsing |
| Integration | API communication, storage |
| E2E | Full capture flow on test sites |
| Cross-browser | Chrome, Firefox, Safari |
| Performance | Large DOM, many detections |

## Appendix C: Sample Sites for Testing

| Site | Pattern | URL Example |
|------|---------|-------------|
| Trading212 | Path | /invite/ABC123 |
| Airbnb | Path | /referral/JOHN |
| Robinhood | Path | /join/USER2024 |
| Crypto.com | Path | /ref/CODE |
| Uber | Query | ?promo=RIDE50 |
| Dropbox | Subdomain | db.tt/ABC123 |
