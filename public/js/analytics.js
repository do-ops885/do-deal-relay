import { api } from "./api.js";

const RELATIVE = [
  { ms: 60_000, d: 1_000, u: "second" },
  { ms: 3_600_000, d: 60_000, u: "minute" },
  { ms: 86_400_000, d: 3_600_000, u: "hour" },
  { ms: 604_800_000, d: 86_400_000, u: "day" },
  { ms: 2_629_800_000, d: 604_800_000, u: "week" },
];
const ACTIVITY_LABELS = {
  deal_discovered: "Deal discovered",
  deal_published: "Deal published",
  deal_expired: "Deal expired",
  referral_created: "Referral created",
  referral_clicked: "Referral clicked",
  referral_converted: "Referral converted",
};
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(v) {
  if (v == null) return "";
  return String(v).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function fmtNum(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toLocaleString("en-US");
}

function fmtRel(ts, now = Date.now()) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const diff = now - d.getTime();
  if (diff < 5_000) return "just now";
  for (const t of RELATIVE) {
    if (diff < t.ms) {
      const n = Math.max(1, Math.floor(diff / t.d));
      return `${n} ${t.u}${n === 1 ? "" : "s"} ago`;
    }
  }
  return d.toISOString().split("T")[0] || "";
}

function fmtDay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function humanize(v) {
  if (!v) return "Activity";
  return String(v)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function last30DayBuckets() {
  const map = new Map();
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().split("T")[0];
    map.set(key, { date: key, label: fmtDay(key), count: 0 });
  }
  return map;
}

function buildDealsOverTime(a) {
  if (Array.isArray(a?.dealsOverTime) && a.dealsOverTime.length) {
    return a.dealsOverTime.slice(-30).map((e) => ({
      date: e.date,
      label: fmtDay(e.date),
      count: Number(e.discovered || 0) + Number(e.published || 0),
    }));
  }
  const buckets = last30DayBuckets();
  for (const item of a?.recentActivity || []) {
    if (!item?.timestamp) continue;
    const b = buckets.get(String(item.timestamp).split("T")[0]);
    if (b) b.count++;
  }
  return Array.from(buckets.values());
}

function buildCategories(a) {
  const raw = a?.dealsByCategory || a?.categoryBreakdown || {};
  const arr = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([k, v]) => ({ category: k, count: v }));
  return arr
    .map((e) => ({
      category: e.category || "unknown",
      count: Number(e.count) || 0,
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);
}

function buildTopSources(a) {
  const raw = a?.dealsBySource || a?.sourcePerformance || {};
  const arr = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([k, v]) => ({ source: k, count: v }));
  return arr
    .map((e) => ({
      source: e.domain || e.source || "unknown",
      count: Number(e.dealsDiscovered ?? e.dealsPublished ?? e.count) || 0,
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 5);
}

function buildActivity(a) {
  if (!Array.isArray(a?.recentActivity)) return [];
  return a.recentActivity.slice(0, 10).map((i) => ({
    type: String(i.type || "unknown"),
    dealId: String(i.dealId || ""),
    timestamp: i.timestamp,
    label: ACTIVITY_LABELS[i.type] || humanize(i.type),
  }));
}

function buildSummary(a) {
  return [
    { label: "Total Deals", value: a?.totalDeals || 0, accent: "primary" },
    { label: "Active Deals", value: a?.activeDeals || 0, accent: "success" },
    { label: "Expiring Soon", value: a?.expiringDeals || 0, accent: "warning" },
    { label: "Total Referrals", value: a?.totalReferrals || 0, accent: "info" },
  ];
}

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") {
      n.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
      continue;
    }
    if (k === "text") {
      n.textContent = String(v);
      continue;
    }
    if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v))
        if (dv != null) n.dataset[dk] = String(dv);
      continue;
    }
    if (k.startsWith("on") && typeof v === "function") {
      n.addEventListener(k.slice(2).toLowerCase(), v);
      continue;
    }
    n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

function renderLoading() {
  const wrap = el("div", {
    class: "analytics-view analytics-view--loading",
    role: "status",
    "aria-busy": "true",
  });
  const sk = (c) => el("div", { class: `skeleton ${c}` });
  wrap.append(
    el("div", { class: "analytics-header" }, [
      sk("skeleton--title"),
      sk("skeleton--subtitle"),
    ]),
    el(
      "div",
      { class: "summary-cards" },
      Array.from({ length: 4 }, () =>
        el(
          "div",
          { class: "analytics-card summary-card summary-card--skeleton" },
          [sk("skeleton--label"), sk("skeleton--value")],
        ),
      ),
    ),
    el(
      "div",
      { class: "analytics-grid" },
      Array.from({ length: 2 }, () =>
        el(
          "div",
          { class: "analytics-card panel panel--skeleton" },
          sk("skeleton--chart"),
        ),
      ),
    ),
    el("div", { class: "sr-only", text: "Loading analytics data" }),
  );
  return wrap;
}

function renderError(message, onRetry) {
  return el(
    "div",
    { class: "analytics-view analytics-view--error", role: "alert" },
    el("div", { class: "analytics-card error-card" }, [
      el("div", {
        class: "error-card__icon",
        "aria-hidden": "true",
        text: "!",
      }),
      el("h2", {
        class: "error-card__title",
        text: "Failed to load analytics",
      }),
      el("p", {
        class: "error-card__message",
        text: message || "An unexpected error occurred.",
      }),
      el(
        "button",
        {
          class: "btn btn--primary",
          type: "button",
          onclick: onRetry,
          "aria-label": "Retry loading analytics",
        },
        "Retry",
      ),
    ]),
  );
}

function renderSummary(cards) {
  return el(
    "div",
    { class: "summary-cards", role: "list" },
    cards.map((c) =>
      el(
        "div",
        {
          class: `analytics-card summary-card summary-card--${c.accent}`,
          role: "listitem",
        },
        [
          el("div", { class: "summary-card__label", text: c.label }),
          el("div", { class: "summary-card__value", text: fmtNum(c.value) }),
        ],
      ),
    ),
  );
}

function panelHeader(id, title, subtitle) {
  return el("header", { class: "panel__header" }, [
    el("h2", { class: "panel__title", id, text: title }),
    el("p", { class: "panel__subtitle", text: subtitle }),
  ]);
}

function emptyMsg(text) {
  return el("p", { class: "panel__empty", text });
}

function renderDealsOverTime(buckets) {
  const card = el(
    "section",
    { class: "analytics-card panel", "aria-labelledby": "chart-deals-title" },
    panelHeader("chart-deals-title", "Deals Over Time", "Last 30 days"),
  );
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const allEmpty = buckets.every((b) => b.count === 0);
  const row = el(
    "div",
    { class: "chart-bars" },
    buckets.map((b) => {
      const h = Math.max(2, Math.round((b.count / max) * 100));
      return el(
        "div",
        {
          class: "chart-bar",
          title: `${b.date}: ${b.count} ${b.count === 1 ? "event" : "events"}`,
          dataset: { date: b.date, count: b.count },
        },
        [
          el("div", {
            class: "chart-bar__count",
            text: b.count > 0 ? String(b.count) : "",
          }),
          el("div", { class: "chart-bar__fill", style: `height: ${h}%` }),
          el("div", { class: "chart-bar__label", text: b.label }),
        ],
      );
    }),
  );
  card.append(
    el(
      "div",
      {
        class: "chart",
        role: "img",
        "aria-label": "Daily deal activity for the last 30 days",
      },
      row,
    ),
    allEmpty ? emptyMsg("No activity in the last 30 days.") : null,
  );
  return card;
}

function renderCategories(entries) {
  const card = el(
    "section",
    { class: "analytics-card panel", "aria-labelledby": "chart-cat-title" },
    panelHeader(
      "chart-cat-title",
      "Category Distribution",
      "Top 10 categories",
    ),
  );
  if (!entries.length) {
    card.append(emptyMsg("No category data available."));
    return card;
  }
  const total = entries.reduce((s, e) => s + e.count, 0) || 1;
  const list = el(
    "ul",
    { class: "category-bars" },
    entries.map((e) => {
      const pct = Math.round((e.count / total) * 100);
      return el("li", { class: "category-bar" }, [
        el("div", { class: "category-bar__head" }, [
          el("span", { class: "category-bar__name", text: e.category }),
          el("span", {
            class: "category-bar__value",
            text: `${fmtNum(e.count)} (${pct}%)`,
          }),
        ]),
        el(
          "div",
          { class: "category-bar__track", "aria-hidden": "true" },
          el("div", { class: "category-bar__fill", style: `width: ${pct}%` }),
        ),
        el("span", {
          class: "sr-only",
          text: `${e.category}: ${e.count} deals, ${pct} percent`,
        }),
      ]);
    }),
  );
  card.append(list);
  return card;
}

function renderSources(sources) {
  const card = el(
    "section",
    { class: "analytics-card panel", "aria-labelledby": "sources-title" },
    panelHeader("sources-title", "Top Sources", "Highest deal volume"),
  );
  if (!sources.length) {
    card.append(emptyMsg("No source data available."));
    return card;
  }
  const max = Math.max(...sources.map((s) => s.count)) || 1;
  const list = el(
    "ol",
    { class: "source-list" },
    sources.map((s, i) => {
      const w = Math.round((s.count / max) * 100);
      return el("li", { class: "source-list__item" }, [
        el("span", {
          class: "source-list__rank",
          "aria-hidden": "true",
          text: String(i + 1),
        }),
        el("div", { class: "source-list__body" }, [
          el("div", { class: "source-list__head" }, [
            el("span", { class: "source-list__name", text: s.source }),
            el("span", { class: "source-list__count", text: fmtNum(s.count) }),
          ]),
          el(
            "div",
            { class: "source-list__track", "aria-hidden": "true" },
            el("div", { class: "source-list__fill", style: `width: ${w}%` }),
          ),
        ]),
      ]);
    }),
  );
  card.append(list);
  return card;
}

function renderActivity(items) {
  const card = el(
    "section",
    { class: "analytics-card panel", "aria-labelledby": "activity-title" },
    panelHeader("activity-title", "Recent Activity", "Last 10 events"),
  );
  if (!items.length) {
    card.append(emptyMsg("No recent activity."));
    return card;
  }
  const now = Date.now();
  const list = el(
    "ul",
    { class: "activity-feed" },
    items.map((i) =>
      el("li", { class: "activity-feed__item" }, [
        el("span", {
          class: `activity-feed__dot activity-feed__dot--${i.type}`,
          "aria-hidden": "true",
        }),
        el("div", { class: "activity-feed__body" }, [
          el("span", { class: "activity-feed__label", text: i.label }),
          i.dealId
            ? el("span", { class: "activity-feed__id", text: i.dealId })
            : null,
        ]),
        el("time", {
          class: "activity-feed__time",
          datetime: i.timestamp || "",
          text: fmtRel(i.timestamp, now),
        }),
      ]),
    ),
  );
  card.append(list);
  return card;
}

function renderFunnel(metrics) {
  const f = metrics?.funnel;
  const card = el(
    "section",
    { class: "analytics-card panel", "aria-labelledby": "funnel-title" },
    el("header", { class: "panel__header" }, [
      el("h2", {
        class: "panel__title",
        id: "funnel-title",
        text: "Pipeline Funnel",
      }),
      el("p", {
        class: "panel__subtitle",
        text: f
          ? `Conversion rate: ${esc(f.conversion_rate || "0%")}`
          : "Discovered to published",
      }),
    ]),
  );
  if (!f) {
    card.append(emptyMsg("No funnel metrics available."));
    return card;
  }
  const stages = [
    { l: "Discovered", v: f.discovered || 0 },
    { l: "Trust Filter", v: f.passed_trust_filter || 0 },
    { l: "All Validation", v: f.passed_all_validation || 0 },
    { l: "Published", v: f.published || 0 },
  ];
  const top = Number(f.discovered) || stages[0].v || 1;
  const list = el(
    "ol",
    { class: "funnel" },
    stages.map((s) => {
      const pct = top > 0 ? Math.round((s.v / top) * 100) : 0;
      return el("li", { class: "funnel__stage" }, [
        el("div", { class: "funnel__head" }, [
          el("span", { class: "funnel__label", text: s.l }),
          el("span", {
            class: "funnel__value",
            text: `${fmtNum(s.v)} (${pct}%)`,
          }),
        ]),
        el(
          "div",
          { class: "funnel__track", "aria-hidden": "true" },
          el("div", { class: "funnel__fill", style: `width: ${pct}%` }),
        ),
      ]);
    }),
  );
  card.append(list);
  return card;
}

function renderView(analytics, metrics) {
  return el("div", { class: "analytics-view" }, [
    el("header", { class: "analytics-header" }, [
      el("h1", { class: "analytics-header__title", text: "Analytics" }),
      el("p", {
        class: "analytics-header__subtitle",
        text: "Real-time view of deal discovery, validation, and referral performance.",
      }),
    ]),
    renderSummary(buildSummary(analytics)),
    el("div", { class: "analytics-grid" }, [
      renderDealsOverTime(buildDealsOverTime(analytics)),
      renderCategories(buildCategories(analytics)),
      renderFunnel(metrics),
      renderSources(buildTopSources(analytics)),
      renderActivity(buildActivity(analytics)),
    ]),
  ]);
}

export async function renderAnalyticsView({ mount } = {}) {
  const root = mount ?? document.createElement("div");
  root.className = "view-root view-root--analytics";
  root.replaceChildren(renderLoading());

  let cancelled = false;

  const load = async () => {
    if (cancelled) return;
    try {
      const [analytics, metrics] = await Promise.all([
        api.getAnalytics(),
        api.getMetrics().catch(() => null),
      ]);
      if (cancelled) return;
      root.replaceChildren(renderView(analytics || {}, metrics || null));
    } catch (err) {
      if (cancelled) return;
      const msg = err?.message || "Unable to reach the analytics service.";
      root.replaceChildren(renderError(msg, load));
    }
  };
  load();
  if (mount)
    return {
      element: root,
      dispose: () => {
        cancelled = true;
      },
    };
  return root;
}
