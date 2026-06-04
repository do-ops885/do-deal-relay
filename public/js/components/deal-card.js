const STATUS_LABELS = {
  active: "Active",
  expired: "Expired",
  pending: "Pending",
};

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] || ch);
}

function formatPrice(deal) {
  if (deal.price && String(deal.price).trim()) return escapeHtml(deal.price);
  if (
    typeof deal.discountPercentage === "number" &&
    deal.discountPercentage > 0
  ) {
    return `${deal.discountPercentage}% off`;
  }
  return "View deal";
}

function formatOriginalPrice(deal) {
  if (!deal.originalPrice) return "";
  return `<s class="deal-card__original">${escapeHtml(deal.originalPrice)}</s>`;
}

function formatDiscount(deal) {
  if (typeof deal.discountPercentage !== "number") return "";
  if (deal.discountPercentage <= 0) return "";
  return `<span class="deal-card__discount">-${deal.discountPercentage}%</span>`;
}

function formatConfidence(confidence) {
  if (typeof confidence !== "number") return null;
  const pct = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  return { pct, label: `${pct}% match` };
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildBadge(status) {
  const key = String(status || "active").toLowerCase();
  const label = STATUS_LABELS[key] || key;
  return `<span class="badge badge--${escapeHtml(key)}" aria-label="Status: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function buildExpiry(deal) {
  if (!deal.expiresAt) return "";
  const formatted = formatDate(deal.expiresAt);
  if (!formatted) return "";
  return `<span class="deal-card__expiry" title="Expires ${escapeHtml(formatted)}">Expires ${escapeHtml(formatted)}</span>`;
}

export function createDealCard(deal, { onSelect } = {}) {
  const article = document.createElement("article");
  article.className = "deal-card";
  article.tabIndex = 0;
  article.setAttribute("role", "button");
  article.dataset.dealId = String(deal.id || "");
  article.setAttribute(
    "aria-label",
    `View deal: ${deal.title || "Untitled"} from ${deal.source || "unknown source"}`,
  );

  const title = escapeHtml(deal.title || "Untitled deal");
  const description = escapeHtml(deal.description || "");
  const source = escapeHtml(deal.source || "Unknown source");
  const category = escapeHtml(deal.category || "general");
  const confidence = formatConfidence(deal.confidence);
  const confidenceBar = confidence
    ? `<span class="deal-card__confidence">
        <span class="deal-card__confidence-track" aria-hidden="true">
          <span class="deal-card__confidence-fill" style="width: ${confidence.pct}%"></span>
        </span>
        <span class="deal-card__confidence-label">${escapeHtml(confidence.label)}</span>
      </span>`
    : "";

  article.innerHTML = `
    <header class="deal-card__header">
      <span class="deal-card__category">${category}</span>
      ${buildBadge(deal.status)}
    </header>
    <h3 class="deal-card__title">${title}</h3>
    <p class="deal-card__description">${description}</p>
    <div class="deal-card__meta">
      <div class="deal-card__pricing">
        <span class="deal-card__price">${formatPrice(deal)}</span>
        ${formatOriginalPrice(deal)}
        ${formatDiscount(deal)}
      </div>
      <span class="deal-card__source">${source}</span>
    </div>
    <footer class="deal-card__footer">
      ${confidenceBar}
      ${buildExpiry(deal)}
    </footer>
  `;

  const activate = () => {
    if (typeof onSelect === "function") onSelect(deal);
  };

  article.addEventListener("click", activate);
  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });

  return article;
}
