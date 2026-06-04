const ENDPOINTS = {
  deals: "/deals",
  dealExplain: (id) => `/api/deals/${encodeURIComponent(id)}/explain`,
  referrals: "/api/referrals",
  analytics: "/api/analytics",
  health: "/health",
  metrics: "/metrics",
};

export class ApiError extends Error {
  constructor(message, { status, type, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 0;
    this.type = type ?? "unknown";
    if (cause) this.cause = cause;
  }
}

function isAbsoluteUrl(path) {
  return /^https?:\/\//i.test(path);
}

function buildUrl(path, query) {
  const base = isAbsoluteUrl(path)
    ? path
    : new URL(path, window.location.origin).toString();
  if (!query || typeof query !== "object") return base;
  const url = new URL(base);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function classifyError(status) {
  if (status === 0) return "network";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 408 || status === 429) return "timeout";
  if (status >= 500) return "server";
  if (status >= 400) return "client";
  return "unknown";
}

async function request(
  path,
  { method = "GET", query, body, signal, headers = {}, timeout = 15000 } = {},
) {
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const externalSignal = signal;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  const init = {
    method,
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      ...headers,
    },
    credentials: "same-origin",
  };

  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers["Content-Type"] =
      init.headers["Content-Type"] ?? "application/json";
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    clearTimeout(timeoutId);
    const isAbort = error?.name === "AbortError";
    throw new ApiError(
      isAbort ? "Request was aborted" : "Network request failed",
      { status: 0, type: isAbort ? "aborted" : "network", cause: error },
    );
  }
  clearTimeout(timeoutId);

  const data = await parseBody(response);

  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.error ??
      data?.message ??
      `HTTP ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      type: classifyError(response.status),
    });
  }

  return data;
}

async function getDeals({ signal } = {}) {
  const data = await request(ENDPOINTS.deals, { signal });
  if (data && typeof data === "object" && Array.isArray(data.deals)) {
    return data;
  }
  if (Array.isArray(data)) return { deals: data, stats: null };
  return { deals: [], stats: null };
}

async function getDeal(id, { signal } = {}) {
  if (!id)
    throw new ApiError("Deal id is required", { status: 400, type: "client" });
  try {
    const list = await getDeals({ signal });
    const match = list.deals?.find((d) => d?.id === id || d?.code === id);
    if (match) return match;
  } catch (primaryError) {
    if (primaryError instanceof ApiError && primaryError.type !== "not_found") {
      try {
        return await request(ENDPOINTS.dealExplain(id), { signal });
      } catch {
        throw primaryError;
      }
    }
    throw primaryError;
  }
  throw new ApiError("Deal not found", { status: 404, type: "not_found" });
}

async function getReferrals({ signal } = {}) {
  const data = await request(ENDPOINTS.referrals, { signal });
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.referrals))
    return data.referrals;
  if (data && typeof data === "object" && Array.isArray(data.data))
    return data.data;
  return [];
}

async function getAnalytics({ signal } = {}) {
  return request(ENDPOINTS.analytics, { signal });
}

async function getHealth({ signal } = {}) {
  try {
    return await request(ENDPOINTS.health, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return request(ENDPOINTS.health.replace(/\/$/, "") + "/live", { signal });
    }
    throw error;
  }
}

async function getMetrics({ format = "json", signal } = {}) {
  return request(ENDPOINTS.metrics, { query: { format }, signal });
}

export const api = {
  getDeals,
  getDeal,
  getReferrals,
  getAnalytics,
  getHealth,
  getMetrics,
};

export default api;
