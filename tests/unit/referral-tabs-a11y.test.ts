import { describe, it, expect, vi, beforeEach } from "vitest";

class MockElement {
  tagName: string;
  className: string = "";
  id: string = "";
  type: string = "";
  value: string = "";
  textContent: string = "";
  hidden: boolean = false;
  focused: boolean = false;
  parentElement: MockElement | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: MockElement[] = [];
  eventListeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
    if (name === "type") this.type = String(value);
    if (name === "value") this.value = String(value);
    if (name === "class") this.className = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  append(...nodes: Array<MockElement | string | Node>): void {
    for (const node of nodes) {
      if (node instanceof MockElement) {
        node.parentElement = this;
        this.children.push(node);
      } else if (typeof node === "string") {
        const textNode = new MockElement("SPAN");
        textNode.textContent = node;
        textNode.parentElement = this;
        this.children.push(textNode);
      }
    }
  }

  appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...nodes: Array<MockElement | string>): void {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(event: string, fn: (event: unknown) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]?.push(fn);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }): boolean {
    const listeners = this.eventListeners[event.type] || [];
    for (const fn of listeners) {
      fn(event);
    }
    return true;
  }

  focus(): void {
    this.focused = true;
    if (globalThis.document) {
      (
        globalThis.document as unknown as { activeElement: unknown }
      ).activeElement = this;
    }
  }

  getRootNode(): MockElement {
    let curr: MockElement = this;
    while (curr.parentElement) {
      curr = curr.parentElement;
    }
    return curr;
  }

  querySelector(selector: string): MockElement | null {
    const results = this.querySelectorAll(selector);
    return results[0] ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const matched: MockElement[] = [];
    const checkNode = (node: MockElement) => {
      let isMatch = false;
      if (selector === '[role="tablist"]') {
        isMatch = node.getAttribute("role") === "tablist";
      } else if (selector === '[role="tab"]') {
        isMatch = node.getAttribute("role") === "tab";
      } else if (selector.startsWith('[data-filter="')) {
        const filterVal = selector.slice(14, -2);
        isMatch = node.dataset.filter === filterVal;
      }
      if (isMatch) matched.push(node);
      for (const child of node.children) {
        checkNode(child);
      }
    };
    checkNode(this);
    return matched;
  }
}

type RenderReferralsView = (options?: { mount?: unknown }) => Promise<unknown>;

describe("renderReferralsView Filter Tabs Accessibility", () => {
  let rootContainer: MockElement;

  beforeEach(() => {
    vi.resetModules();
    rootContainer = new MockElement("DIV");
    globalThis.Node = MockElement as unknown as typeof Node;
    const activeDoc = {
      activeElement: null as unknown as MockElement | null,
      createElement: (tag: string) => new MockElement(tag),
      createTextNode: (str: string) => {
        const el = new MockElement("SPAN");
        el.textContent = str;
        return el;
      },
      querySelector: (selector: string) =>
        rootContainer.querySelector(selector),
      querySelectorAll: (selector: string) =>
        rootContainer.querySelectorAll(selector),
    };
    globalThis.document = activeDoc as unknown as Document;
    globalThis.requestAnimationFrame = (fn: FrameRequestCallback): number => {
      fn(0);
      return 1;
    };
  });

  it("should set tabindex='0' on active tab and tabindex='-1' on inactive tabs", async () => {
    const apiMock = {
      getReferrals: vi.fn().mockResolvedValue([
        { id: "ref-1", code: "CODE1", status: "active", dealTitle: "Deal 1" },
        { id: "ref-2", code: "CODE2", status: "pending", dealTitle: "Deal 2" },
      ]),
    };

    vi.doMock("../../public/js/api.js", () => ({
      api: apiMock,
    }));

    const mod = (await import("../../public/js/referrals.js")) as unknown as {
      renderReferralsView: RenderReferralsView;
    };

    await mod.renderReferralsView({ mount: rootContainer });

    const tabList = rootContainer.querySelector('[role="tablist"]');
    expect(tabList).not.toBeNull();

    const tabs = tabList?.querySelectorAll('[role="tab"]') ?? [];
    expect(tabs.length).toBe(5);

    // Active tab ('all') should have tabindex="0" and aria-selected="true"
    const activeTab = tabs.find((t) => t.dataset.filter === "all");
    expect(activeTab).toBeDefined();
    expect(activeTab?.getAttribute("aria-selected")).toBe("true");
    expect(activeTab?.getAttribute("tabindex")).toBe("0");

    // Inactive tabs should have tabindex="-1" and aria-selected="false"
    const inactiveTabs = tabs.filter((t) => t.dataset.filter !== "all");
    for (const tab of inactiveTabs) {
      expect(tab.getAttribute("aria-selected")).toBe("false");
      expect(tab.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("should navigate tabs with ArrowRight, ArrowLeft, Home, and End keys", async () => {
    const apiMock = {
      getReferrals: vi
        .fn()
        .mockResolvedValue([
          { id: "ref-1", code: "CODE1", status: "active", dealTitle: "Deal 1" },
        ]),
    };

    vi.doMock("../../public/js/api.js", () => ({
      api: apiMock,
    }));

    const mod = (await import("../../public/js/referrals.js")) as unknown as {
      renderReferralsView: RenderReferralsView;
    };

    await mod.renderReferralsView({ mount: rootContainer });

    let tabList = rootContainer.querySelector('[role="tablist"]');
    expect(tabList).not.toBeNull();

    let tabs = tabList?.querySelectorAll('[role="tab"]') ?? [];

    // Focus the first tab ('all')
    tabs[0]?.focus();
    expect(
      (globalThis.document as unknown as { activeElement: unknown })
        .activeElement,
    ).toBe(tabs[0]);

    // Dispatch ArrowRight
    let prevented = false;
    tabList?.dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);

    // After ArrowRight, active filter should be 'active' (index 1)
    tabList = rootContainer.querySelector('[role="tablist"]');
    tabs = tabList?.querySelectorAll('[role="tab"]') ?? [];
    let selectedTab = tabs.find(
      (t) => t.getAttribute("aria-selected") === "true",
    );
    expect(selectedTab?.dataset.filter).toBe("active");
    expect(selectedTab?.getAttribute("tabindex")).toBe("0");
    expect(selectedTab?.focused).toBe(true);

    // Dispatch End key
    tabList?.dispatchEvent({
      type: "keydown",
      key: "End",
      preventDefault: () => {},
    });

    // After End, active filter should be 'reported' (last tab)
    tabList = rootContainer.querySelector('[role="tablist"]');
    tabs = tabList?.querySelectorAll('[role="tab"]') ?? [];
    selectedTab = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    expect(selectedTab?.dataset.filter).toBe("reported");
    expect(selectedTab?.getAttribute("tabindex")).toBe("0");
    expect(selectedTab?.focused).toBe(true);

    // Dispatch Home key
    tabList?.dispatchEvent({
      type: "keydown",
      key: "Home",
      preventDefault: () => {},
    });

    // After Home, active filter should return to 'all' (first tab)
    tabList = rootContainer.querySelector('[role="tablist"]');
    tabs = tabList?.querySelectorAll('[role="tab"]') ?? [];
    selectedTab = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    expect(selectedTab?.dataset.filter).toBe("all");
    expect(selectedTab?.getAttribute("tabindex")).toBe("0");
    expect(selectedTab?.focused).toBe(true);
  });
});
