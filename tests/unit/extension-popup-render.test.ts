import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockElement {
  tagName: string;
  type?: string;
  className: string;
  textContent: string;
  title?: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  children: MockElement[];
  eventListeners: Record<string, Array<() => void>>;
  classList: {
    add: (cls: string) => void;
    remove: (cls: string) => void;
    contains: (cls: string) => boolean;
  };
  appendChild: (child: MockElement) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  addEventListener: (event: string, fn: () => void) => void;
  click: () => void;
}

function createMockElement(tagName: string): MockElement {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  const childrenList: MockElement[] = [];

  const el: MockElement = {
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    style: {},
    attributes: attrs,
    children: childrenList,
    eventListeners: listeners,
    classList: {
      add: (cls: string) => {
        classes.add(cls);
        el.className = Array.from(classes).join(" ");
      },
      remove: (cls: string) => {
        classes.delete(cls);
        el.className = Array.from(classes).join(" ");
      },
      contains: (cls: string) => classes.has(cls),
    },
    appendChild: (child: MockElement) => {
      childrenList.push(child);
    },
    setAttribute: (name: string, value: string) => {
      attrs[name] = value;
      if (name === "type") el.type = value;
    },
    getAttribute: (name: string) => attrs[name] ?? null,
    addEventListener: (event: string, fn: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    click: () => {
      const clickListeners = listeners["click"] || [];
      for (const fn of clickListeners) {
        fn();
      }
    },
  };
  return el;
}

describe("PopupRender.renderDealFeed accessibility", () => {
  let mockChromeTabsCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockChromeTabsCreate = vi.fn();
    (globalThis as unknown as Record<string, unknown>).chrome = {
      tabs: {
        create: mockChromeTabsCreate,
      },
    };
    (globalThis as unknown as Record<string, unknown>).document = {
      createElement: (tag: string) => createMockElement(tag),
    };
  });

  it("should render interactive feed items as <button type='button'> with descriptive aria-label", async () => {
    // Load popup-render.js in a scope where PopupRender is exposed
    const code = await import("node:fs/promises").then((fs) =>
      fs.readFile("extension/popup-render.js", "utf-8"),
    );

    // Evaluate in function scope
    const fn = new Function(
      "chrome",
      "document",
      `${code}; return PopupRender;`,
    );
    const PopupRender = fn(
      (globalThis as unknown as Record<string, unknown>).chrome,
      (globalThis as unknown as Record<string, unknown>).document,
    );

    const dealFeedList = createMockElement("div");
    const lastPollTime = createMockElement("span");
    const feedBadge = createMockElement("span");
    const clearBadgeBtn = createMockElement("button");
    const feedEmpty = createMockElement("div");

    const elements = {
      dealFeedList,
      lastPollTime,
      feedBadge,
      clearBadgeBtn,
      feedEmpty,
    };

    const meta = {
      lastPoll: new Date().toISOString(),
      newCount: 1,
      highValueDeals: [
        {
          code: "SAVE100",
          domain: "example.com",
          title: "Example Deal",
          url: "https://example.com/deal",
          reward: { value: 100 },
        },
      ],
    };

    PopupRender.renderDealFeed(meta, elements);

    expect(dealFeedList.children.length).toBe(1);
    const item = dealFeedList.children[0];
    expect(item).toBeDefined();
    if (!item) return;

    expect(item.tagName).toBe("BUTTON");
    expect(item.type).toBe("button");
    expect(item.getAttribute("aria-label")).toBe(
      "Open example.com deal SAVE100 in new tab",
    );

    item.click();
    expect(mockChromeTabsCreate).toHaveBeenCalledWith({
      url: "https://example.com/deal",
    });
  });

  it("should render non-interactive feed items as <div> when url is missing", async () => {
    const code = await import("node:fs/promises").then((fs) =>
      fs.readFile("extension/popup-render.js", "utf-8"),
    );

    const fn = new Function(
      "chrome",
      "document",
      `${code}; return PopupRender;`,
    );
    const PopupRender = fn(
      (globalThis as unknown as Record<string, unknown>).chrome,
      (globalThis as unknown as Record<string, unknown>).document,
    );

    const dealFeedList = createMockElement("div");
    const lastPollTime = createMockElement("span");
    const feedBadge = createMockElement("span");
    const feedEmpty = createMockElement("div");

    const elements = {
      dealFeedList,
      lastPollTime,
      feedBadge,
      feedEmpty,
    };

    const meta = {
      lastPoll: new Date().toISOString(),
      newCount: 0,
      highValueDeals: [
        {
          code: "NOURL",
          domain: "test.com",
          title: "No URL Deal",
        },
      ],
    };

    PopupRender.renderDealFeed(meta, elements);

    expect(dealFeedList.children.length).toBe(1);
    const item = dealFeedList.children[0];
    expect(item).toBeDefined();
    if (!item) return;

    expect(item.tagName).toBe("DIV");
    expect(item.type).toBeUndefined();
    expect(item.getAttribute("aria-label")).toBeNull();
  });
});
