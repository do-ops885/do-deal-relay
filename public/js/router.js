const ROUTE_PATTERNS = [
  { pattern: /^\/deals$/, name: "deals" },
  { pattern: /^\/deals\/([^/]+)$/, name: "deal-detail" },
  { pattern: /^\/referrals$/, name: "referrals" },
  { pattern: /^\/analytics$/, name: "analytics" },
  { pattern: /^\/research$/, name: "research" },
  { pattern: /^\/health$/, name: "health" },
];

const DEFAULT_ROUTE = "deals";

function parseHash(hash) {
  const raw = (hash ?? "").replace(/^#/, "");
  const cleaned = raw.replace(/^\/+/, "/") || "/";
  const [pathPart, queryPart = ""] = cleaned.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      if (!pair) continue;
      const [rawKey, rawValue = ""] = pair.split("=");
      const key = decodeURIComponent(rawKey ?? "");
      const value = decodeURIComponent(rawValue);
      if (key) query[key] = value;
    }
  }
  return { path, query };
}

function matchRoute(path) {
  for (const entry of ROUTE_PATTERNS) {
    const match = entry.pattern.exec(path);
    if (match) {
      return { name: entry.name, params: match.slice(1) };
    }
  }
  return { name: "not-found", params: [] };
}

function createRouter({
  outlet,
  views = {},
  notFound,
  onChange,
  onError,
} = {}) {
  const registeredViews = { ...views };
  let notFoundRenderer = typeof notFound === "function" ? notFound : null;
  let currentRoute = null;

  function registerView(name, renderer) {
    if (typeof renderer !== "function") return;
    registeredViews[name] = renderer;
  }

  function setNotFound(renderer) {
    notFoundRenderer = typeof renderer === "function" ? renderer : null;
  }

  async function resolve(location) {
    const { path, query } = parseHash(location?.hash ?? "");
    const { name, params } = matchRoute(path);
    const renderer = registeredViews[name] ?? notFoundRenderer;
    return { name, path, query, params, renderer };
  }

  async function render(location) {
    if (!outlet) return null;
    const result = await resolve(location);
    currentRoute = result;
    outlet.innerHTML = "";
    const context = {
      mount: outlet,
      query: result.query,
      params: result.params,
      route: result,
    };
    try {
      if (typeof result.renderer !== "function") {
        throw new Error(`No renderer registered for route "${result.name}"`);
      }
      const returned = await result.renderer(context);
      if (returned instanceof Node) outlet.appendChild(returned);
      else if (returned?.element instanceof Node) {
        if (returned.element.parentNode !== outlet)
          outlet.appendChild(returned.element);
      }
    } catch (error) {
      if (onError) onError(error, result);
      const fallback = notFoundRenderer;
      if (fallback && fallback !== result.renderer) {
        try {
          const returned = await fallback({ ...context, error });
          if (returned instanceof Node) outlet.appendChild(returned);
        } catch (fallbackError) {
          if (onError) onError(fallbackError, result);
        }
      }
    }
    if (onChange) onChange(result);
    return result;
  }

  function navigate(path, { replace = false } = {}) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const target = `#${normalized}`;
    if (replace) {
      const url = `${window.location.pathname}${window.location.search}${target}`;
      window.history.replaceState(null, "", url);
      return render(window.location);
    }
    if (window.location.hash === target) {
      return render(window.location);
    }
    window.location.hash = target.slice(1);
  }

  function start() {
    window.addEventListener("hashchange", () => {
      render(window.location);
    });
    if (!window.location.hash) {
      const initial = `#/${DEFAULT_ROUTE}`;
      const url = `${window.location.pathname}${window.location.search}${initial}`;
      window.history.replaceState(null, "", url);
    }
    return render(window.location);
  }

  function getCurrent() {
    return currentRoute;
  }

  return {
    start,
    render,
    navigate,
    getCurrent,
    registerView,
    setNotFound,
  };
}

export { createRouter, parseHash, matchRoute, ROUTE_PATTERNS, DEFAULT_ROUTE };
export default createRouter;
