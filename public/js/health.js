import { api } from "./api.js";

function element(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "text") node.textContent = String(value);
    else if (key === "class") node.className = String(value);
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child != null)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  }
  return node;
}

function statusLabel(status) {
  return String(status ?? "unknown").replace(/[_-]+/g, " ");
}

function renderHealth(data) {
  const dependencies = Object.entries(data?.dependencies ?? {});
  const dependencyList = element("ul", { class: "health-dependencies" });
  if (!dependencies.length)
    dependencyList.append(
      element("li", {
        class: "health-dependencies__empty",
        text: "No dependency details returned.",
      }),
    );
  for (const [key, dependency] of dependencies) {
    const status = dependency?.status ?? "unknown";
    dependencyList.append(
      element("li", { class: "health-dependency" }, [
        element("span", {
          class: `health-status health-status--${status}`,
          text: statusLabel(status),
        }),
        element("div", { class: "health-dependency__body" }, [
          element("strong", { text: dependency?.name ?? key }),
          dependency?.error
            ? element("p", {
                class: "health-dependency__error",
                text: dependency.error,
              })
            : null,
        ]),
        dependency?.latency_ms != null
          ? element("span", {
              class: "health-dependency__latency",
              text: `${dependency.latency_ms}ms`,
            })
          : null,
      ]),
    );
  }

  const pipeline = data?.pipeline;
  return element("div", { class: "health-view" }, [
    element("header", { class: "view-header" }, [
      element("div", {}, [
        element("h1", { class: "view-title", text: "System Health" }),
        element("p", {
          class: "view-subtitle",
          text: "Live dependency checks and pipeline readiness.",
        }),
      ]),
      element("span", {
        class: `health-status health-status--${data?.status ?? "unknown"}`,
        text: statusLabel(data?.status),
      }),
    ]),
    element("div", { class: "health-summary", role: "list" }, [
      element("div", { class: "health-stat", role: "listitem" }, [
        element("span", { class: "health-stat__label", text: "Environment" }),
        element("strong", { text: data?.environment ?? "unknown" }),
      ]),
      element("div", { class: "health-stat", role: "listitem" }, [
        element("span", { class: "health-stat__label", text: "Version" }),
        element("strong", { text: data?.version ?? "unknown" }),
      ]),
      element("div", { class: "health-stat", role: "listitem" }, [
        element("span", { class: "health-stat__label", text: "Uptime" }),
        element("strong", { text: `${data?.uptime_seconds ?? 0}s` }),
      ]),
      element("div", { class: "health-stat", role: "listitem" }, [
        element("span", { class: "health-stat__label", text: "Last run" }),
        element("strong", {
          text: pipeline?.last_run
            ? pipeline.last_success
              ? "Succeeded"
              : "Failed"
            : "No runs",
        }),
      ]),
    ]),
    element(
      "section",
      {
        class: "card health-card",
        "aria-labelledby": "health-dependencies-title",
      },
      [
        element("h2", {
          class: "card-title",
          id: "health-dependencies-title",
          text: "Dependencies",
        }),
        dependencyList,
      ],
    ),
    element(
      "section",
      { class: "card health-card", "aria-labelledby": "health-checks-title" },
      [
        element("h2", {
          class: "card-title",
          id: "health-checks-title",
          text: "Checks",
        }),
        element(
          "ul",
          { class: "health-checks" },
          Object.entries(data?.checks ?? {}).map(([key, value]) =>
            element("li", { class: "health-check" }, [
              element("span", {
                class: `health-status health-status--${value ? "healthy" : "unhealthy"}`,
                text: value ? "pass" : "fail",
              }),
              element("span", { text: statusLabel(key) }),
            ]),
          ),
        ),
      ],
    ),
  ]);
}

export async function renderHealthView({ mount } = {}) {
  const root = mount ?? document.createElement("div");
  root.className = "view-root view-root--health";
  root.replaceChildren(
    element("div", {
      class: "card",
      role: "status",
      text: "Loading system health…",
    }),
  );
  try {
    root.replaceChildren(renderHealth(await api.getHealth()));
  } catch (error) {
    root.replaceChildren(
      element("div", { class: "card", role: "alert" }, [
        element("h1", {
          class: "card-title",
          text: "System Health unavailable",
        }),
        element("p", {
          class: "placeholder-text",
          text: error?.message ?? "Unable to load health information.",
        }),
        element("button", {
          class: "btn btn-primary",
          type: "button",
          text: "Retry",
          onclick: () => renderHealthView({ mount }),
        }),
      ]),
    );
  }
  return root;
}
