import { api } from "./api.js";

const VALID_FILTERS = ["all", "active", "pending", "expired", "reported"];
const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const STATUS_LABEL = {
  active: "Active",
  pending: "Pending",
  expired: "Expired",
  reported: "Reported",
};

function fmtNum(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US");
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().split("T")[0] || "—";
}

function fmtRel(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (Math.abs(days) < 1) return "today";
  if (Math.abs(days) < 30)
    return days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`;
  return fmtDate(v);
}

function normalizeStatus(raw) {
  const v = String(raw || "")
    .toLowerCase()
    .trim();
  if (v === "quarantined" || v === "pending_review") return "pending";
  if (v === "deactivated" || v === "disabled") return "expired";
  return VALID_FILTERS.includes(v) && v !== "all" ? v : "pending";
}

function prepare(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const status = normalizeStatus(r.status);
  const title = String(
    r.dealTitle || r.title || r.metadata?.title || "Untitled deal",
  );
  return {
    id: String(r.id || r.referral_id || ""),
    dealId: String(r.dealId || r.deal_id || ""),
    dealTitle: title,
    code: String(r.code || ""),
    status,
    createdAt: r.createdAt || r.created_at || r.submitted_at || null,
    expiresAt: r.expiresAt || r.expires_at || null,
    clicks: Number(r.clicks || r.click_count || 0) || 0,
    conversions: Number(r.conversions || r.conversion_count || 0) || 0,
    url: String(r.url || ""),
    domain: String(r.domain || ""),
    description: String(r.description || r.metadata?.description || ""),
    _lc: {
      code: String(r.code || "").toLowerCase(),
      title: title.toLowerCase(),
      domain: String(r.domain || "").toLowerCase(),
      id: String(r.id || "").toLowerCase(),
    },
  };
}

function toast(root, msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  t.textContent = msg;
  root.append(t);
  requestAnimationFrame(() => t.classList.add("toast--visible"));
  setTimeout(() => {
    t.classList.remove("toast--visible");
    setTimeout(() => t.remove(), 250);
  }, 2400);
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

function debounce(fn, wait) {
  let t = null;
  return function (...a) {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn.apply(this, a);
    }, wait);
  };
}

function renderToolbar(state, cb) {
  const counts = {
    all: state.raw.length,
    active: 0,
    pending: 0,
    expired: 0,
    reported: 0,
  };
  for (const r of state.raw) if (counts[r.status] != null) counts[r.status]++;
  const tabs = el("div", {
    class: "filter-tabs",
    role: "tablist",
    "aria-label": "Filter by status",
  });
  for (const f of VALID_FILTERS) {
    const active = state.filter === f;
    tabs.append(
      el(
        "button",
        {
          class: `filter-tab${active ? " filter-tab--active" : ""}`,
          type: "button",
          role: "tab",
          "aria-selected": active ? "true" : "false",
          dataset: { filter: f },
          onclick: () => cb.onFilter(f),
        },
        [
          el("span", {
            class: "filter-tab__label",
            text: f === "all" ? "All" : STATUS_LABEL[f],
          }),
          el("span", {
            class: "filter-tab__count",
            "aria-hidden": "true",
            text: String(counts[f] || 0),
          }),
          el("span", { class: "sr-only", text: `${counts[f] || 0} referrals` }),
        ],
      ),
    );
  }
  return el("div", { class: "referrals-toolbar", role: "search" }, [
    el("div", { class: "search-bar" }, [
      el("label", {
        class: "sr-only",
        for: "referrals-search",
        text: "Search referrals",
      }),
      el("input", {
        id: "referrals-search",
        class: "search-bar__input",
        type: "search",
        placeholder: "Search code, title, or domain...",
        autocomplete: "off",
        value: state.search,
        oninput: (e) => cb.onSearch(e.target.value),
      }),
    ]),
    tabs,
    el(
      "div",
      { class: "referrals-toolbar__actions" },
      el(
        "button",
        {
          class: `btn btn--primary${state.formOpen ? " btn--active" : ""}`,
          type: "button",
          "aria-expanded": state.formOpen ? "true" : "false",
          "aria-controls": "referral-add-form",
          onclick: () => cb.onToggleForm(),
        },
        state.formOpen ? "Close" : "Add Referral",
      ),
    ),
  ]);
}

function renderStatusBadge(status) {
  const label = STATUS_LABEL[status] || "Pending";
  return el(
    "span",
    { class: `badge badge--${status}`, "aria-label": `Status: ${label}` },
    label,
  );
}

function renderItem(ref, expanded, cb) {
  const headId = `rh-${ref.id}`;
  const detId = `rd-${ref.id}`;
  const field = (dt, dd) =>
    el("div", { class: "referral-item__field" }, [
      el("dt", { text: dt }),
      el("dd", { text: dd }),
    ]);
  const header = el(
    "button",
    {
      class: "referral-item__header",
      type: "button",
      id: headId,
      "aria-expanded": expanded ? "true" : "false",
      "aria-controls": detId,
      onclick: () => cb.onToggle(ref.id),
    },
    [
      el("div", { class: "referral-item__primary" }, [
        el("span", {
          class: "referral-item__code",
          text: ref.code || "(no code)",
        }),
        el("span", { class: "referral-item__title", text: ref.dealTitle }),
        ref.domain
          ? el("span", { class: "referral-item__domain", text: ref.domain })
          : null,
      ]),
      el("div", { class: "referral-item__meta" }, [
        renderStatusBadge(ref.status),
        el("span", {
          class: "referral-item__chevron",
          "aria-hidden": "true",
          text: expanded ? "−" : "+",
        }),
      ]),
    ],
  );
  const urlField = ref.url
    ? el("div", { class: "referral-item__field" }, [
        el("dt", { text: "URL" }),
        el(
          "dd",
          {},
          el("a", {
            class: "referral-item__link",
            href: ref.url,
            target: "_blank",
            rel: "noopener noreferrer",
            text: ref.url,
          }),
        ),
      ])
    : null;
  const details = el(
    "div",
    {
      class: "referral-item__details",
      id: detId,
      role: "region",
      "aria-labelledby": headId,
      hidden: expanded ? null : "",
    },
    [
      el("dl", { class: "referral-item__grid" }, [
        field("Referral ID", ref.id || "—"),
        ref.dealId ? field("Deal ID", ref.dealId) : null,
        field("Code", ref.code || "—"),
        urlField,
        field("Created", fmtDate(ref.createdAt)),
        field(
          "Expires",
          ref.expiresAt
            ? `${fmtDate(ref.expiresAt)} (${fmtRel(ref.expiresAt)})`
            : "Never",
        ),
        field("Clicks", fmtNum(ref.clicks)),
        field("Conversions", fmtNum(ref.conversions)),
      ]),
      ref.description
        ? el("p", {
            class: "referral-item__description",
            text: ref.description,
          })
        : null,
      el(
        "div",
        { class: "referral-item__actions" },
        el(
          "button",
          {
            class: "btn btn--ghost btn--danger",
            type: "button",
            dataset: { action: "report", id: ref.id },
            onclick: () => cb.onReport(ref),
          },
          "Report",
        ),
      ),
    ],
  );
  return el(
    "article",
    {
      class: `referral-item${expanded ? " referral-item--expanded" : ""}`,
      dataset: { id: ref.id, status: ref.status },
    },
    [header, details],
  );
}

function renderAddForm(cb) {
  const field = (name, label, ph, type = "text", required = false) => {
    const id = `rf-${name}`;
    return el("div", { class: "form-group" }, [
      el("label", { class: "form-group__label", for: id, text: label }),
      el("input", {
        id,
        class: "form-input",
        name,
        type,
        placeholder: ph,
        autocomplete: "off",
        required: required ? "" : null,
      }),
    ]);
  };
  return el(
    "form",
    {
      class: "referral-add-form",
      id: "referral-add-form",
      novalidate: "",
      onsubmit: (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        cb.onSubmit(
          {
            code: String(d.get("code") || "").trim(),
            url: String(d.get("url") || "").trim(),
            domain: String(d.get("domain") || "").trim(),
            title: String(d.get("title") || "").trim(),
          },
          e.currentTarget,
        );
      },
    },
    [
      el("h3", { class: "form-title", text: "Add Referral" }),
      el("p", {
        class: "form-subtitle",
        text: "Saved locally until backend wiring is enabled.",
      }),
      el("div", { class: "form-row" }, [
        field("code", "Referral Code", "e.g. SAVE20", "text", true),
        field("domain", "Domain", "example.com", "text", true),
      ]),
      el("div", { class: "form-row" }, [
        field(
          "url",
          "Referral URL",
          "https://example.com/?ref=SAVE20",
          "url",
          true,
        ),
        field("title", "Deal Title", "Optional short title"),
      ]),
      el("div", { class: "form-actions" }, [
        el(
          "button",
          {
            class: "btn btn--ghost",
            type: "button",
            onclick: () => cb.onCancel(),
          },
          "Cancel",
        ),
        el(
          "button",
          { class: "btn btn--primary", type: "submit" },
          "Save Referral",
        ),
      ]),
    ],
  );
}

function renderEmpty(view) {
  return el("div", { class: "empty-state" }, [
    el("div", { class: "empty-state__icon", "aria-hidden": "true", text: "—" }),
    el("h2", { class: "empty-state__title", text: "No referrals yet" }),
    el("p", {
      class: "empty-state__message",
      text:
        view === "search"
          ? "No referrals match your search or filter."
          : "Add your first referral to start tracking performance.",
    }),
  ]);
}

function renderLoading() {
  const skel = (cls) => el("div", { class: `skeleton ${cls}` });
  return el(
    "div",
    {
      class: "referrals-view referrals-view--loading",
      role: "status",
      "aria-busy": "true",
    },
    [
      el("div", { class: "skeleton skeleton--title" }),
      el("div", { class: "skeleton skeleton--subtitle" }),
      el(
        "div",
        { class: "referral-list" },
        Array.from({ length: 4 }, () =>
          el("div", { class: "referral-item referral-item--skeleton" }, [
            skel("skeleton--line"),
            skel("skeleton--line skeleton--line--short"),
          ]),
        ),
      ),
    ],
  );
}

function renderError(message, onRetry) {
  return el(
    "div",
    { class: "referrals-view referrals-view--error", role: "alert" },
    el("div", { class: "analytics-card error-card" }, [
      el("div", {
        class: "error-card__icon",
        "aria-hidden": "true",
        text: "!",
      }),
      el("h2", {
        class: "error-card__title",
        text: "Failed to load referrals",
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
          "aria-label": "Retry loading referrals",
        },
        "Retry",
      ),
    ]),
  );
}

function applySearchFilter(raw, filter, search) {
  const term = search.trim().toLowerCase();
  return raw.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!term) return true;
    return (
      r._lc.code.includes(term) ||
      r._lc.title.includes(term) ||
      r._lc.domain.includes(term) ||
      r._lc.id.includes(term)
    );
  });
}

export async function renderReferralsView({ mount } = {}) {
  const root = mount ?? document.createElement("div");
  root.className = "view-root view-root--referrals";
  root.replaceChildren(renderLoading());

  const state = {
    raw: [],
    filter: "all",
    search: "",
    expanded: new Set(),
    formOpen: false,
  };
  let cancelled = false;

  const listEl = el("div", { class: "referral-list-wrapper" });
  const formEl = el("div", { class: "referral-form-wrapper", hidden: "" });

  const render = () => {
    if (cancelled) return;
    formEl.hidden = !state.formOpen;
    formEl.replaceChildren();
    if (state.formOpen) {
      formEl.append(
        renderAddForm({
          onCancel: () => {
            state.formOpen = false;
            render();
          },
          onSubmit: (payload, formNode) => {
            if (!payload.code || !payload.url || !payload.domain) {
              toast(root, "Code, URL, and domain are required.");
              return;
            }
            const ref = prepare({
              id: `local-${Date.now()}`,
              code: payload.code,
              url: payload.url,
              domain: payload.domain,
              title: payload.title || `${payload.domain} Referral`,
              status: "pending",
              submitted_at: new Date().toISOString(),
            });
            state.raw = [ref, ...state.raw];
            state.formOpen = false;
            toast(root, "Referral added locally");
            if (formNode) formNode.reset();
            render();
          },
        }),
      );
    }

    const visible = applySearchFilter(state.raw, state.filter, state.search);
    listEl.replaceChildren();
    if (!state.raw.length) {
      listEl.append(renderEmpty("empty"));
    } else if (!visible.length) {
      listEl.append(renderEmpty("search"));
    } else {
      const list = el("ul", { class: "referral-list", role: "list" });
      for (const r of visible) {
        list.append(
          el(
            "li",
            { class: "referral-list__entry" },
            renderItem(r, state.expanded.has(r.id), {
              onToggle: (id) => {
                if (state.expanded.has(id)) state.expanded.delete(id);
                else state.expanded.add(id);
                render();
              },
              onReport: (target) => {
                const idx = state.raw.findIndex((x) => x.id === target.id);
                if (idx === -1) return;
                const updated = { ...state.raw[idx], status: "reported" };
                const next = state.raw.slice();
                next[idx] = updated;
                state.raw = next;
                toast(root, "Reported");
                render();
              },
            }),
          ),
        );
      }
      listEl.append(list);
    }

    const toolbar = renderToolbar(state, {
      onSearch: debounce((v) => {
        state.search = v;
        render();
      }, 200),
      onFilter: (f) => {
        state.filter = VALID_FILTERS.includes(f) ? f : "all";
        render();
      },
      onToggleForm: () => {
        state.formOpen = !state.formOpen;
        render();
      },
    });

    root.replaceChildren(
      el("div", { class: "referrals-view" }, [
        el("header", { class: "referrals-header" }, [
          el("h1", { class: "referrals-header__title", text: "Referrals" }),
          el("p", {
            class: "referrals-header__subtitle",
            text: "Track referral codes, performance, and status.",
          }),
        ]),
        toolbar,
        formEl,
        listEl,
      ]),
    );
  };

  const load = async () => {
    if (cancelled) return;
    root.replaceChildren(renderLoading());
    try {
      const res = await api.getReferrals();
      if (cancelled) return;
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.referrals)
          ? res.referrals
          : Array.isArray(res?.data)
            ? res.data
            : [];
      state.raw = list.map(prepare);
      render();
    } catch (err) {
      if (cancelled) return;
      root.replaceChildren(
        renderError(
          err?.message || "Unable to reach the referrals service.",
          load,
        ),
      );
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
