import { createRouter } from "./router.js";
import { api, ApiError } from "./api.js";
import { renderDealsView } from "./deals.js";
import { renderReferralsView } from "./referrals.js";
import { renderAnalyticsView } from "./analytics.js";
import { renderResearchView } from "./research.js";
import { renderHealthView } from "./health.js";

const DASHBOARD_VERSION = "0.1.8";

const THEME_KEY = "ddr:theme";
const SIDEBAR_KEY = "ddr:sidebar";
const STATUS_REFRESH_MS = 60_000;

const SELECTORS = {
  app: "#app",
  themeToggle: "#themeToggle",
  sidebarToggle: "#sidebarToggle",
  sidebarBackdrop: "#sidebarBackdrop",
  view: "#view",
  loadingOverlay: "#loadingOverlay",
  errorBoundary: "#errorBoundary",
  errorMessage: "#errorMessage",
  errorRetry: "#errorRetry",
  errorDismiss: "#errorDismiss",
  statusIndicator: "#statusIndicator",
  statusLabel: "#statusLabel",
  appVersion: "#appVersion",
  navLinks: ".nav-link[data-route]",
};

const STATUS_MAP = {
  healthy: { label: "Operational", attr: "healthy" },
  ok: { label: "Operational", attr: "healthy" },
  up: { label: "Operational", attr: "healthy" },
  degraded: { label: "Degraded", attr: "degraded" },
  warning: { label: "Degraded", attr: "degraded" },
  unhealthy: { label: "Down", attr: "unhealthy" },
  down: { label: "Down", attr: "unhealthy" },
  error: { label: "Error", attr: "error" },
  unknown: { label: "Checking", attr: "unknown" },
};

const ROUTE_TITLES = {
  deals: "Deals",
  "deal-detail": "Deal Details",
  referrals: "Referrals",
  analytics: "Analytics",
  research: "Research",
  health: "System Health",
  "not-found": "Not Found",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

const safeStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage disabled */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage disabled */
    }
  },
};

const ThemeManager = {
  detect() {
    const stored = safeStorage.get(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches)
      return "dark";
    return "light";
  },
  apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    safeStorage.set(THEME_KEY, theme);
  },
  toggle() {
    const current =
      document.documentElement.getAttribute("data-theme") ?? this.detect();
    const next = current === "dark" ? "light" : "dark";
    this.apply(next);
    return next;
  },
  init() {
    this.apply(this.detect());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (mq) {
      const onChange = (event) => {
        if (!safeStorage.get(THEME_KEY))
          this.apply(event.matches ? "dark" : "light");
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  },
};

const SidebarManager = {
  isOpen() {
    return document.getElementById("app")?.dataset.sidebarOpen === "true";
  },
  open() {
    const app = document.getElementById("app");
    if (!app) return;
    app.dataset.sidebarOpen = "true";
    safeStorage.set(SIDEBAR_KEY, "open");
    const toggle = $(SELECTORS.sidebarToggle);
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  },
  close() {
    const app = document.getElementById("app");
    if (!app) return;
    delete app.dataset.sidebarOpen;
    safeStorage.remove(SIDEBAR_KEY);
    const toggle = $(SELECTORS.sidebarToggle);
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  },
  toggle() {
    this.isOpen() ? this.close() : this.open();
  },
  init() {
    const toggle = $(SELECTORS.sidebarToggle);
    const backdrop = $(SELECTORS.sidebarBackdrop);
    toggle?.addEventListener("click", () => this.toggle());
    backdrop?.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isOpen()) this.close();
    });
    const stored = safeStorage.get(SIDEBAR_KEY);
    if (stored === "open" && window.innerWidth >= 768) this.open();
  },
};

const LoadingManager = {
  active: 0,
  show() {
    this.active += 1;
    const view = $(SELECTORS.view);
    const overlay = $(SELECTORS.loadingOverlay);
    if (view) view.setAttribute("aria-busy", "true");
    if (overlay) overlay.hidden = false;
  },
  hide() {
    this.active = Math.max(0, this.active - 1);
    if (this.active > 0) return;
    const view = $(SELECTORS.view);
    const overlay = $(SELECTORS.loadingOverlay);
    if (view) view.setAttribute("aria-busy", "false");
    if (overlay) overlay.hidden = true;
  },
  reset() {
    this.active = 0;
    this.hide();
  },
};

const ErrorBoundary = {
  show(message, { onRetry } = {}) {
    const boundary = $(SELECTORS.errorBoundary);
    const messageEl = $(SELECTORS.errorMessage);
    if (!boundary || !messageEl) return;
    messageEl.textContent = message ?? "An unexpected error occurred.";
    boundary.hidden = false;
    const retry = $(SELECTORS.errorRetry);
    const dismiss = $(SELECTORS.errorDismiss);
    if (retry) {
      retry.onclick = () => {
        this.hide();
        if (typeof onRetry === "function") onRetry();
      };
    }
    if (dismiss) dismiss.onclick = () => this.hide();
  },
  hide() {
    const boundary = $(SELECTORS.errorBoundary);
    if (boundary) boundary.hidden = true;
  },
};

const StatusManager = {
  update(status) {
    const indicator = $(SELECTORS.statusIndicator);
    const label = $(SELECTORS.statusLabel);
    if (!indicator || !label) return;
    const key = typeof status === "string" ? status.toLowerCase() : "unknown";
    const entry = STATUS_MAP[key] ?? STATUS_MAP.unknown;
    indicator.setAttribute("data-status", entry.attr);
    label.textContent = entry.label;
  },
  async refresh() {
    this.update("unknown");
    try {
      const data = await api.getHealth({ timeout: 5000 });
      const status = data?.status ?? data?.state ?? data?.health ?? "healthy";
      this.update(status);
      return data;
    } catch (error) {
      this.update(
        error instanceof ApiError && error.status === 0
          ? "unknown"
          : "unhealthy",
      );
      return null;
    }
  },
};

const NavManager = {
  sync(routeName) {
    $$(SELECTORS.navLinks).forEach((link) => {
      const target = link.getAttribute("data-route");
      if (target === routeName) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  },
};

function createPlaceholderView({ title, subtitle, body }) {
  return function renderPlaceholder(context) {
    const mount = context?.mount ?? document.createElement("div");
    mount.innerHTML = "";
    const header = document.createElement("div");
    header.className = "view-header";

    const titleEl = document.createElement("h1");
    titleEl.className = "view-title";
    titleEl.textContent = title;
    header.appendChild(titleEl);

    if (subtitle) {
      const sub = document.createElement("p");
      sub.className = "view-subtitle";
      sub.textContent = subtitle;
      header.appendChild(sub);
    }
    mount.appendChild(header);

    const card = document.createElement("section");
    card.className = "card";
    const cardTitle = document.createElement("h2");
    cardTitle.className = "card-title";
    cardTitle.textContent = "Coming soon";
    card.appendChild(cardTitle);
    const cardBody = document.createElement("p");
    cardBody.className = "placeholder-text";
    cardBody.textContent =
      body ?? "This view will be implemented in a follow-up task.";
    card.appendChild(cardBody);
    mount.appendChild(card);
  };
}

function createNotFoundView() {
  return function renderNotFound(context) {
    const mount = context?.mount ?? document.createElement("div");
    mount.innerHTML = "";
    const wrap = document.createElement("section");
    wrap.className = "card";

    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = "Page not found";
    wrap.appendChild(title);

    const message = document.createElement("p");
    message.className = "placeholder-text";
    message.style.marginBottom = "var(--space-3)";
    const requested = context?.params?.[0];
    message.textContent = requested
      ? `No view matches "${requested}".`
      : "The page you requested could not be located.";
    wrap.appendChild(message);

    const link = document.createElement("a");
    link.className = "btn btn-primary";
    link.href = "#/deals";
    link.textContent = "Go to Deals";
    wrap.appendChild(link);

    mount.appendChild(wrap);
    return wrap;
  };
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    console.error("[app] uncaught error", event.error ?? event.message);
    const message = event.error?.message ?? event.message ?? "Unexpected error";
    ErrorBoundary.show(message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[app] unhandled rejection", event.reason);
    const message =
      event.reason?.message ?? String(event.reason ?? "Promise rejected");
    ErrorBoundary.show(message);
    event.preventDefault();
  });
}

function initThemeToggle() {
  const button = $(SELECTORS.themeToggle);
  if (!button) return;
  button.addEventListener("click", () => ThemeManager.toggle());
}

function initVersionLabel() {
  const el = $(SELECTORS.appVersion);
  if (!el) return;
  if (!el.textContent) el.textContent = `v${DASHBOARD_VERSION}`;
}

function initNavDelegation() {
  document.addEventListener("click", (event) => {
    const link =
      event.target instanceof Element
        ? event.target.closest("a[href^='#/']")
        : null;
    if (!link) return;
    if (window.innerWidth < 768) SidebarManager.close();
  });
}

function buildViews() {
  return {
    deals: renderDealsView,
    referrals: renderReferralsView,
    analytics: renderAnalyticsView,
    "deal-detail": createPlaceholderView({
      title: "Deal Details",
      subtitle: "Detailed information for a single deal",
      body: "Select a deal from the Deals view to see its details.",
    }),
    research: renderResearchView,
    health: renderHealthView,
  };
}

function bootstrap() {
  const appEl = $(SELECTORS.app);
  const viewEl = $(SELECTORS.view);
  if (!appEl || !viewEl) {
    console.error("[app] required DOM elements missing");
    return;
  }

  installGlobalErrorHandlers();
  ThemeManager.init();
  initThemeToggle();
  SidebarManager.init();
  initVersionLabel();
  initNavDelegation();

  const views = buildViews();
  const router = createRouter({
    outlet: viewEl,
    views,
    notFound: createNotFoundView(),
    onChange: (result) => {
      NavManager.sync(result.name);
      const title = ROUTE_TITLES[result.name] ?? "Dashboard";
      document.title = `${title} - do-deal-relay`;
      if (window.innerWidth < 768) SidebarManager.close();
      LoadingManager.reset();
      const focusTarget = viewEl;
      if (focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.focus({ preventScroll: true });
      }
    },
    onError: (error, result) => {
      console.error("[app] route error", error, result);
      ErrorBoundary.show(error?.message ?? "Failed to load view", {
        onRetry: () => router.render(window.location),
      });
      LoadingManager.reset();
    },
  });

  window.__ddrApp = {
    api,
    ApiError,
    ThemeManager,
    SidebarManager,
    StatusManager,
    LoadingManager,
    ErrorBoundary,
    router,
    registerView: (name, renderer) => router.registerView(name, renderer),
  };
  window.__ddrViews = views;

  LoadingManager.show();
  router
    .start()
    .catch((error) => {
      console.error("[app] bootstrap failed", error);
      ErrorBoundary.show(error?.message ?? "Failed to start dashboard");
    })
    .finally(() => LoadingManager.hide());

  StatusManager.refresh();
  setInterval(() => StatusManager.refresh(), STATUS_REFRESH_MS);

  window.addEventListener("online", () => StatusManager.refresh());
  window.addEventListener("offline", () => StatusManager.update("unknown"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
