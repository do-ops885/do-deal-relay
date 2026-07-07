import { api } from "../api.js";
import { escapeHtml } from "../utils/html.js";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatConfidence(confidence) {
  if (typeof confidence !== "number") return null;
  const pct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  return pct;
}

function normalizeDeal(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.price !== undefined) return raw;
  const m = raw.metadata || {};
  const s = raw.source || {};
  const r = raw.reward || {};
  const e = raw.expiry || {};
  const cats = Array.isArray(m.category)
    ? m.category
    : raw.category
      ? [raw.category]
      : [];
  const value = r.value;
  const price =
    value == null
      ? ""
      : typeof value === "number" && r.currency
        ? `${value} ${r.currency}`
        : String(value);
  return {
    ...raw,
    title: raw.title || "",
    description: raw.description || "",
    price,
    source: raw.source || s.domain || "",
    sourceUrl: raw.sourceUrl || s.url || raw.url || "",
    category: cats[0] || raw.category || "general",
    status: String(raw.status || m.status || "active").toLowerCase(),
    confidence:
      typeof raw.confidence === "number"
        ? raw.confidence
        : (m.confidence_score ?? null),
    expiresAt: raw.expiresAt || e.date || null,
    createdAt: raw.createdAt || m.normalized_at || null,
  };
}

function buildStatusBadge(status) {
  const key = String(status || "active").toLowerCase();
  return `<span class="badge badge--${escapeHtml(key)}">${escapeHtml(key)}</span>`;
}

function buildCopyButton(code) {
  return `<button type="button" class="deal-detail__copy" data-copy="${escapeHtml(code)}" aria-label="Copy referral code ${escapeHtml(code)} to clipboard">Copy code</button>`;
}

function buildDealContent(deal) {
  const expires = formatDate(deal.expiresAt);
  const confidence = formatConfidence(deal.confidence);
  const originalPrice = deal.originalPrice
    ? `<s class="deal-detail__original">${escapeHtml(deal.originalPrice)}</s>`
    : "";
  const discount =
    typeof deal.discountPercentage === "number" && deal.discountPercentage > 0
      ? `<span class="deal-detail__discount">-${deal.discountPercentage}%</span>`
      : "";
  const sourceUrl = deal.sourceUrl
    ? `<a class="deal-detail__source-link" href="${escapeHtml(deal.sourceUrl)}" target="_blank" rel="noopener noreferrer">Visit source</a>`
    : "";
  const codeBlock = deal.code
    ? `<section class="deal-detail__section deal-detail__code-section">
        <h3 class="deal-detail__section-title">Referral code</h3>
        <div class="deal-detail__code">
          <code class="deal-detail__code-value">${escapeHtml(deal.code)}</code>
          ${buildCopyButton(deal.code)}
        </div>
        <p class="deal-detail__copy-status" role="status" aria-live="polite" hidden></p>
      </section>`
    : "";

  return `
    <header class="deal-detail__header">
      <div class="deal-detail__badges">
        ${buildStatusBadge(deal.status)}
        ${deal.category ? `<span class="deal-detail__category">${escapeHtml(deal.category)}</span>` : ""}
      </div>
      <h2 id="deal-detail-title" class="deal-detail__title">${escapeHtml(deal.title || "Untitled deal")}</h2>
      <p class="deal-detail__source">From ${escapeHtml(deal.source || "unknown source")}</p>
    </header>
    <section class="deal-detail__section">
      <p class="deal-detail__description">${escapeHtml(deal.description || "")}</p>
    </section>
    <section class="deal-detail__section">
      <h3 class="deal-detail__section-title">Reward</h3>
      <p class="deal-detail__price">${escapeHtml(deal.price || "View deal for details")}</p>
      ${originalPrice || discount ? `<p class="deal-detail__pricing-meta">${originalPrice}${discount}</p>` : ""}
    </section>
    <section class="deal-detail__section deal-detail__details">
      <dl class="deal-detail__list">
        ${expires ? `<div class="deal-detail__row"><dt>Expires</dt><dd>${escapeHtml(expires)}</dd></div>` : ""}
        ${confidence !== null ? `<div class="deal-detail__row"><dt>Confidence</dt><dd>${confidence}%</dd></div>` : ""}
        ${deal.createdAt ? `<div class="deal-detail__row"><dt>Added</dt><dd>${escapeHtml(formatDate(deal.createdAt) || "")}</dd></div>` : ""}
        ${deal.sourceUrl ? `<div class="deal-detail__row"><dt>Source URL</dt><dd>${escapeHtml(deal.sourceUrl)}</dd></div>` : ""}
      </dl>
    </section>
    ${codeBlock}
    <footer class="deal-detail__footer">
      ${sourceUrl}
      <button type="button" class="deal-detail__close-btn" data-close>Close</button>
    </footer>
  `;
}

function buildLoading() {
  return `<div class="loading" role="status" aria-live="polite">
    <span class="loading__spinner" aria-hidden="true"></span>
    <span class="loading__text">Loading deal details...</span>
  </div>`;
}

function buildError(message) {
  return `<div class="error" role="alert">
    <h3 class="error__title">Failed to load deal</h3>
    <p class="error__message">${escapeHtml(message || "An unexpected error occurred. Please try again.")}</p>
    <button type="button" class="error__retry" data-retry>Retry</button>
  </div>`;
}

function buildNotFound() {
  return `<div class="deal-detail__empty" role="status">
    <h3 class="deal-detail__empty-title">Deal not found</h3>
    <p class="deal-detail__empty-message">This deal may have expired or been removed.</p>
    <button type="button" class="deal-detail__close-btn" data-close>Close</button>
  </div>`;
}

let activeDialog = null;
let activeController = null;
let lastFocused = null;

function closeActive() {
  if (activeDialog && activeDialog.open) {
    activeDialog.close();
  }
}

function isClickOutsideDialog(event, dialog) {
  if (event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }
  return fallbackCopy(text);
}

async function fallbackCopy(text) {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    textarea.remove();
    return success;
  } catch {
    return false;
  }
}

function handleCopyClick(dialog, event) {
  const target = event.target.closest("[data-copy]");
  if (!target) return;
  const code = target.getAttribute("data-copy");
  if (!code) return;
  const status = dialog.querySelector(".deal-detail__copy-status");
  copyToClipboard(code).then((ok) => {
    if (!status) return;
    status.hidden = false;
    status.textContent = ok
      ? "Code copied to clipboard"
      : "Copy failed - select and copy manually";
  });
}

function handleDialogClick(dialog, event) {
  if (event.target.closest("[data-close]")) {
    event.preventDefault();
    dialog.close();
    return;
  }
  if (event.target.closest("[data-retry]")) {
    event.preventDefault();
    loadAndRender(dialog);
    return;
  }
  if (isClickOutsideDialog(event, dialog)) {
    dialog.close();
    return;
  }
  handleCopyClick(dialog, event);
}

function renderInto(dialog, html) {
  const content = dialog.querySelector(".deal-detail__content");
  if (content) content.innerHTML = html;
}

async function loadAndRender(dialog) {
  const id = dialog.dataset.dealId;
  if (!id) {
    renderInto(dialog, buildNotFound());
    return;
  }
  renderInto(dialog, buildLoading());
  if (activeController) activeController.abort();
  const controller = new AbortController();
  activeController = controller;
  try {
    const raw = await api.getDeal(id, { signal: controller.signal });
    if (controller.signal.aborted) return;
    const deal = normalizeDeal(raw);
    if (!deal) {
      renderInto(dialog, buildNotFound());
      return;
    }
    renderInto(dialog, buildDealContent(deal));
  } catch (err) {
    if (err && err.name === "AbortError") return;
    renderInto(dialog, buildError(err && err.message ? err.message : null));
  } finally {
    if (activeController === controller) activeController = null;
  }
}

export async function showDealDetail(dealId) {
  if (!dealId) return;
  closeActive();
  lastFocused = document.activeElement;

  const dialog = document.createElement("dialog");
  dialog.className = "modal deal-detail";
  dialog.setAttribute("aria-labelledby", "deal-detail-title");
  dialog.setAttribute("aria-modal", "true");
  dialog.dataset.dealId = String(dealId);

  dialog.innerHTML = `
    <button type="button" class="modal__close" data-close aria-label="Close deal details">
      <span aria-hidden="true">&times;</span>
    </button>
    <div class="deal-detail__content" role="document">
      ${buildLoading()}
    </div>
  `;

  document.body.appendChild(dialog);
  activeDialog = dialog;
  dialog.showModal();

  dialog.addEventListener("click", (event) => handleDialogClick(dialog, event));
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (activeDialog === dialog) activeDialog = null;
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  });

  await loadAndRender(dialog);
}

export function closeDealDetail() {
  closeActive();
}
