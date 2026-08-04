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

function renderHeader() {
  return element("header", { class: "view-header" }, [
    element("div", {}, [
      element("h1", { class: "view-title", text: "Research" }),
      element("p", {
        class: "view-subtitle",
        text: "Investigate a domain for referral programs and discovered codes.",
      }),
    ]),
  ]);
}

function renderForm(domain, onSubmit) {
  const input = element("input", {
    class: "research-search__input",
    type: "text",
    name: "domain",
    value: domain,
    placeholder: "example.com",
    autocomplete: "url",
    required: true,
    "aria-label": "Domain to research",
  });
  const form = element(
    "form",
    { class: "research-search", "aria-label": "Research a domain" },
    [
      element("label", {
        class: "research-search__label",
        for: "research-domain",
        text: "Domain",
      }),
      Object.assign(input, { id: "research-domain" }),
      element("button", {
        class: "btn btn-primary",
        type: "submit",
        text: "Research",
      }),
    ],
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit(input.value.trim());
  });
  return form;
}

function renderResult(result) {
  const metadata = result?.research_metadata ?? {};
  const codes = Array.isArray(result?.discovered_codes)
    ? result.discovered_codes
    : [];
  const summary = element("div", { class: "research-summary", role: "list" }, [
    element("div", { class: "research-stat", role: "listitem" }, [
      element("span", { class: "research-stat__label", text: "Codes found" }),
      element("strong", { class: "research-stat__value", text: codes.length }),
    ]),
    element("div", { class: "research-stat", role: "listitem" }, [
      element("span", {
        class: "research-stat__label",
        text: "Sources checked",
      }),
      element("strong", {
        class: "research-stat__value",
        text: metadata.sources_checked?.length ?? 0,
      }),
    ]),
    element("div", { class: "research-stat", role: "listitem" }, [
      element("span", { class: "research-stat__label", text: "Duration" }),
      element("strong", {
        class: "research-stat__value",
        text: `${Math.round((metadata.research_duration_ms ?? 0) / 100) / 10}s`,
      }),
    ]),
  ]);

  const list = element("ul", { class: "research-results" });
  if (codes.length === 0) {
    list.append(
      element("li", {
        class: "research-results__empty",
        text: "No referral codes were discovered for this domain.",
      }),
    );
  } else {
    for (const code of codes.slice(0, 20)) {
      list.append(
        element("li", { class: "research-result" }, [
          element("div", { class: "research-result__head" }, [
            element("strong", {
              class: "research-result__code",
              text: code.code ?? "Unknown code",
            }),
            element("span", {
              class: "research-result__confidence",
              text: `${Math.round((Number(code.confidence) || 0) * 100)}% confidence`,
            }),
          ]),
          element("p", {
            class: "research-result__source",
            text: code.source ?? "Unknown source",
          }),
          code.reward_summary
            ? element("p", {
                class: "research-result__reward",
                text: code.reward_summary,
              })
            : null,
          code.url
            ? element("a", {
                class: "research-result__link",
                href: code.url,
                target: "_blank",
                rel: "noreferrer",
                text: "Open source",
              })
            : null,
        ]),
      );
    }
  }

  return element(
    "section",
    {
      class: "card research-results-card",
      "aria-labelledby": "research-results-title",
    },
    [
      element("h2", {
        class: "card-title",
        id: "research-results-title",
        text: `Results for ${result?.domain ?? "domain"}`,
      }),
      summary,
      list,
    ],
  );
}

function renderMessage(message, type = "info") {
  return element("p", {
    class: `research-message research-message--${type}`,
    role: type === "error" ? "alert" : "status",
    text: message,
  });
}

export async function renderResearchView({ mount, query } = {}) {
  const root = mount ?? document.createElement("div");
  root.className = "view-root view-root--research";
  root.replaceChildren(renderHeader());

  let activeRequest = 0;
  let currentDomain = query?.domain ?? "";
  const content = element("div", { class: "research-content" });
  root.append(
    renderForm(currentDomain, async (domain) => {
      currentDomain = domain;
      const requestId = ++activeRequest;
      content.replaceChildren(renderMessage("Checking research sources…"));
      if (!domain) {
        content.replaceChildren(
          renderMessage("Enter a domain to begin research.", "error"),
        );
        return;
      }
      try {
        const result = await api.getResearchResults(domain);
        if (requestId === activeRequest)
          content.replaceChildren(renderResult(result));
      } catch (error) {
        if (requestId === activeRequest)
          content.replaceChildren(
            renderMessage(
              error?.message ?? "Research could not be completed.",
              "error",
            ),
          );
      }
    }),
    content,
  );

  if (currentDomain) {
    const submit = root.querySelector(".research-search");
    submit?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  } else {
    content.append(
      renderMessage(
        "Research is opt-in per domain. Enter a domain above to inspect it.",
      ),
    );
  }

  return root;
}
