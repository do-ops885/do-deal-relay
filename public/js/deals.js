import { api } from "./api.js";
import { createDealCard } from "./components/deal-card.js";
import { showDealDetail } from "./components/deal-detail.js";
import { escapeHtml } from "./utils/html.js";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const DEFAULT_CATEGORIES = [
  "all",
  "trading",
  "investment",
  "crypto",
  "banking",
  "shopping",
  "food",
  "travel",
  "general",
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "relevance", label: "Relevance" },
  { value: "confidence", label: "Confidence" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "pending", label: "Pending" },
];

function formatTimestamp(value) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
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

function matchesSearch(deal, needle) {
  if (!needle) return true;
  const haystack =
    `${deal.title || ""} ${deal.description || ""} ${deal.source || ""}`.toLowerCase();
  return haystack.includes(needle);
}

function matchesCategory(deal, category) {
  if (!category || category === "all") return true;
  const value = String(deal.category || "").toLowerCase();
  if (value === category.toLowerCase()) return true;
  const first = String(deal.category || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return first === category.toLowerCase();
}

function matchesStatus(deal, status) {
  if (!status || status === "all") return true;
  return String(deal.status || "").toLowerCase() === status.toLowerCase();
}

function compareDeals(a, b, sort) {
  if (sort === "confidence") {
    return (b.confidence || 0) - (a.confidence || 0);
  }
  if (sort === "oldest") {
    return formatTimestamp(a.createdAt) - formatTimestamp(b.createdAt);
  }
  if (sort === "relevance") {
    const conf = (b.confidence || 0) - (a.confidence || 0);
    if (conf !== 0) return conf;
    return formatTimestamp(b.createdAt) - formatTimestamp(a.createdAt);
  }
  return formatTimestamp(b.createdAt) - formatTimestamp(a.createdAt);
}

function applyFilters(deals, state) {
  const needle = state.search.trim().toLowerCase();
  return deals
    .filter((deal) => matchesSearch(deal, needle))
    .filter((deal) => matchesCategory(deal, state.category))
    .filter((deal) => matchesStatus(deal, state.status))
    .slice()
    .sort((a, b) => compareDeals(a, b, state.sort));
}

function pageSlice(deals, page) {
  const start = (page - 1) * PAGE_SIZE;
  return deals.slice(start, start + PAGE_SIZE);
}

function buildCategories(deals) {
  const counts = new Map();
  for (const deal of deals) {
    const value =
      String(deal.category || "general")
        .split(",")[0]
        .trim()
        .toLowerCase() || "general";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const known = new Set(DEFAULT_CATEGORIES);
  const extras = [...counts.keys()].filter((c) => !known.has(c)).sort();
  return [...DEFAULT_CATEGORIES, ...extras];
}

function buildSkeleton(count = 6) {
  return `<div class="deals-view__skeleton" aria-hidden="true">
    ${Array.from(
      { length: count },
      () => `
      <div class="deal-card deal-card--skeleton">
        <div class="deal-card__line deal-card__line--title"></div>
        <div class="deal-card__line deal-card__line--text"></div>
        <div class="deal-card__line deal-card__line--text deal-card__line--short"></div>
      </div>`,
    ).join("")}
  </div>`;
}

function buildEmpty(state) {
  const hasFilters =
    state.search || state.category !== "all" || state.status !== "all";
  const message = hasFilters
    ? "No deals match your filters. Try adjusting your search or filters."
    : "No deals available right now. Please check back later.";
  return `<div class="deals-view__empty" role="status">
    <p class="deals-view__empty-message">${escapeHtml(message)}</p>
    ${hasFilters ? `<button type="button" class="deals-view__reset" data-action="reset">Clear filters</button>` : ""}
  </div>`;
}

function buildError(message, retryable) {
  return `<div class="deals-view__error error" role="alert">
    <h3 class="error__title">Failed to load deals</h3>
    <p class="error__message">${escapeHtml(message || "An unexpected error occurred.")}</p>
    ${retryable ? `<button type="button" class="error__retry" data-action="retry">Retry</button>` : ""}
  </div>`;
}

function buildPageButton(
  label,
  page,
  { current = false, disabled = false, ariaLabel } = {},
) {
  const cls = current
    ? "deals-view__page deals-view__page--current"
    : "deals-view__page";
  const aria = ariaLabel || `Go to page ${page}`;
  const disabledAttr = disabled ? 'disabled aria-disabled="true"' : "";
  return `<button type="button" class="${cls}" data-page="${page}" aria-label="${escapeHtml(aria)}" ${current ? 'aria-current="page"' : ""} ${disabledAttr}>${escapeHtml(label)}</button>`;
}

function buildPagination(totalPages, currentPage) {
  if (totalPages <= 1) return "";
  const pages = new Set([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ]);
  const ordered = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const items = [];
  let last = 0;
  for (const page of ordered) {
    if (page - last > 1) {
      items.push(
        `<span class="deals-view__ellipsis" aria-hidden="true">&hellip;</span>`,
      );
    }
    items.push(
      buildPageButton(String(page), page, { current: page === currentPage }),
    );
    last = page;
  }
  return `<nav class="deals-view__pagination" aria-label="Pagination">
    ${buildPageButton("Previous", currentPage - 1, { disabled: currentPage === 1, ariaLabel: "Previous page" })}
    <div class="deals-view__pages">${items.join("")}</div>
    ${buildPageButton("Next", currentPage + 1, { disabled: currentPage === totalPages, ariaLabel: "Next page" })}
  </nav>`;
}

function buildCountLine(filtered, total) {
  if (filtered === total) {
    return `<p class="deals-view__count">${total} deal${total === 1 ? "" : "s"}</p>`;
  }
  return `<p class="deals-view__count">Showing ${filtered} of ${total} deal${total === 1 ? "" : "s"}</p>`;
}

function renderShell() {
  return `<section class="deals-view" aria-label="Deals">
    <header class="deals-view__header">
      <div>
        <h1 class="deals-view__title">Deals</h1>
        <p class="deals-view__subtitle">Discover referral offers curated for you</p>
      </div>
      <p class="deals-view__count" data-count></p>
    </header>
    <form class="deals-view__filters" role="search" aria-label="Filter deals" data-filters>
      <div class="deals-view__field deals-view__field--search">
        <label class="visually-hidden" for="deals-search">Search deals</label>
        <input type="search" id="deals-search" class="deals-view__search" placeholder="Search by title, description, or source" autocomplete="off" data-filter="search" />
      </div>
      <div class="deals-view__field">
        <label class="visually-hidden" for="deals-category">Category</label>
        <select id="deals-category" class="deals-view__select" data-filter="category">
          <option value="all">All categories</option>
        </select>
      </div>
      <div class="deals-view__field">
        <label class="visually-hidden" for="deals-status">Status</label>
        <select id="deals-status" class="deals-view__select" data-filter="status">
          ${STATUS_OPTIONS.map((s) => `<option value="${s.value}">${s.label}</option>`).join("")}
        </select>
      </div>
      <div class="deals-view__field">
        <label class="visually-hidden" for="deals-sort">Sort by</label>
        <select id="deals-sort" class="deals-view__select" data-filter="sort">
          ${SORT_OPTIONS.map((s) => `<option value="${s.value}">Sort: ${s.label}</option>`).join("")}
        </select>
      </div>
    </form>
    <div class="deals-view__results" data-results aria-live="polite" aria-busy="false"></div>
  </section>`;
}

export async function renderDealsView() {
  const root = document.createElement("div");
  root.innerHTML = renderShell();
  const section = root.firstElementChild;

  const filterForm = section.querySelector("[data-filters]");
  const searchInput = section.querySelector('[data-filter="search"]');
  const categorySelect = section.querySelector('[data-filter="category"]');
  const statusSelect = section.querySelector('[data-filter="status"]');
  const sortSelect = section.querySelector('[data-filter="sort"]');
  const results = section.querySelector("[data-results]");
  const countEl = section.querySelector("[data-count]");

  const state = {
    deals: [],
    search: "",
    category: "all",
    status: "all",
    sort: "newest",
    page: 1,
    loading: true,
    error: null,
  };

  let debounceTimer = null;
  let loadController = null;

  function populateCategories() {
    const categories = buildCategories(state.deals);
    const current = state.category;
    categorySelect.innerHTML = categories
      .map((c) => {
        const label =
          c === "all"
            ? "All categories"
            : c.charAt(0).toUpperCase() + c.slice(1);
        return `<option value="${escapeHtml(c)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    if (categories.includes(current)) {
      categorySelect.value = current;
    } else {
      categorySelect.value = "all";
      state.category = "all";
    }
  }

  function syncControls() {
    if (searchInput.value !== state.search) searchInput.value = state.search;
    if (categorySelect.value !== state.category)
      categorySelect.value = state.category;
    if (statusSelect.value !== state.status) statusSelect.value = state.status;
    if (sortSelect.value !== state.sort) sortSelect.value = state.sort;
  }

  function renderResults() {
    results.setAttribute("aria-busy", state.loading ? "true" : "false");
    if (state.loading) {
      results.innerHTML = buildSkeleton();
      countEl.textContent = "";
      return;
    }
    if (state.error) {
      results.innerHTML = buildError(state.error, true);
      countEl.textContent = "";
      return;
    }
    const filtered = applyFilters(state.deals, state);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const pageItems = pageSlice(filtered, state.page);
    countEl.innerHTML = buildCountLine(filtered.length, state.deals.length);
    if (pageItems.length === 0) {
      results.innerHTML = buildEmpty(state);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "deal-grid";
    grid.setAttribute("role", "list");
    for (const deal of pageItems) {
      const card = createDealCard(deal, {
        onSelect: (d) => showDealDetail(d.id),
      });
      card.setAttribute("role", "listitem");
      grid.appendChild(card);
    }
    results.replaceChildren(grid);
    if (totalPages > 1) {
      const pagination = document.createElement("div");
      pagination.innerHTML = buildPagination(totalPages, state.page);
      results.appendChild(pagination.firstElementChild);
    }
  }

  async function load() {
    if (loadController) loadController.abort();
    const controller = new AbortController();
    loadController = controller;
    state.loading = true;
    state.error = null;
    renderResults();
    try {
      const response = await api.getDeals({
        limit: 1000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const list = Array.isArray(response)
        ? response
        : Array.isArray(response?.deals)
          ? response.deals
          : [];
      state.deals = list.map(normalizeDeal).filter(Boolean);
      state.loading = false;
      state.error = null;
      populateCategories();
      renderResults();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      state.loading = false;
      state.error = (err && err.message) || "Failed to load deals";
      renderResults();
    } finally {
      if (loadController === controller) loadController = null;
    }
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = searchInput.value;
    debounceTimer = setTimeout(() => {
      state.search = value.trim();
      state.page = 1;
      renderResults();
    }, SEARCH_DEBOUNCE_MS);
  });

  const onFilterChange = (key) => () => {
    if (key === "search") return;
    state[key] = controls[key].value;
    state.page = 1;
    renderResults();
  };

  const controls = {
    category: categorySelect,
    status: statusSelect,
    sort: sortSelect,
  };
  for (const [key, el] of Object.entries(controls)) {
    el.addEventListener("change", onFilterChange(key));
  }

  results.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) {
      const action = actionEl.dataset.action;
      if (action === "retry") {
        load();
      } else if (action === "reset") {
        state.search = "";
        state.category = "all";
        state.status = "all";
        state.sort = "newest";
        state.page = 1;
        syncControls();
        renderResults();
      }
      return;
    }
    const pageBtn = event.target.closest("[data-page]");
    if (pageBtn) {
      const page = Number(pageBtn.dataset.page);
      if (Number.isFinite(page) && page >= 1) {
        state.page = page;
        renderResults();
        const header = section.querySelector(".deals-view__header");
        if (header && typeof header.scrollIntoView === "function") {
          header.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  });

  filterForm.addEventListener("submit", (event) => event.preventDefault());

  await load();
  return section;
}
