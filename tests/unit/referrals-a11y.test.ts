import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockEvent {
  type: string;
  key?: string;
  preventDefault?: () => void;
}

class MockNode {}

class MockElement extends MockNode {
  tagName: string;
  className: string = "";
  tabIndex: number = -1;
  dataset: Record<string, string> = {};
  innerHTML: string = "";
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Array<(event: MockEvent) => void>> = {};
  children: MockElement[] = [];

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  append(...nodes: (MockElement | string | null | undefined)[]): void {
    for (const node of nodes) {
      if (!node) continue;
      if (typeof node === "string") {
        const textNode = new MockElement("SPAN");
        textNode.innerHTML = node;
        this.children.push(textNode);
      } else {
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes: (MockElement | string)[]): void {
    this.children = [];
    this.append(...nodes);
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('[data-filter="')) {
      const filterVal = selector.slice(14, -2);
      return this.findChild((el) => el.dataset.filter === filterVal);
    }
    if (selector === '[role="tablist"]') {
      return this.findChild((el) => el.getAttribute("role") === "tablist");
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    if (selector === '[role="tab"]') {
      return this.findAllChildren((el) => el.getAttribute("role") === "tab");
    }
    return [];
  }

  findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  findAllChildren(predicate: (el: MockElement) => boolean): MockElement[] {
    const results: MockElement[] = [];
    if (predicate(this)) results.push(this);
    for (const child of this.children) {
      results.push(...child.findAllChildren(predicate));
    }
    return results;
  }

  addEventListener(event: string, fn: (event: MockEvent) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]?.push(fn);
  }

  dispatchEvent(event: MockEvent): void {
    const listeners = this.eventListeners[event.type] || [];
    for (const fn of listeners) {
      fn(event);
    }
  }

  focus(): void {}
}

// Mock the api module
vi.mock("../../public/js/api.js", () => ({
  api: {
    getReferrals: vi.fn().mockResolvedValue([]),
  },
}));

async function loadReferralsView() {
  return await import("../../public/js/referrals.js");
}

describe("referrals view accessibility & tablist keyboard navigation", () => {
  beforeEach(() => {
    globalThis.Node = MockNode as unknown as typeof Node;
    const stubDocument = {
      createElement: (tag: string): HTMLElement =>
        new MockElement(tag) as unknown as HTMLElement,
      createTextNode: (text: string) => text,
    };
    globalThis.document = stubDocument as unknown as Document;
  });

  it("renders filter tabs with tab role, aria-selected, and correct tabindex", async () => {
    const { renderReferralsView } = await loadReferralsView();
    const mount = document.createElement("div") as unknown as MockElement;
    await renderReferralsView({ mount: mount as unknown as HTMLElement });

    const tablist = mount.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist?.getAttribute("aria-label")).toBe("Filter by status");

    const tabs = mount.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);

    // Initial filter is "all", so first tab should be active/selected with tabindex="0"
    const activeTab = tabs[0];
    expect(activeTab?.getAttribute("aria-selected")).toBe("true");
    expect(activeTab?.getAttribute("tabindex")).toBe("0");

    // Other tabs should have aria-selected="false" and tabindex="-1"
    for (let i = 1; i < tabs.length; i++) {
      expect(tabs[i]?.getAttribute("aria-selected")).toBe("false");
      expect(tabs[i]?.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("handles ArrowRight and ArrowLeft keyboard navigation across filter tabs", async () => {
    const { renderReferralsView } = await loadReferralsView();
    const mount = document.createElement("div") as unknown as MockElement;
    await renderReferralsView({ mount: mount as unknown as HTMLElement });

    const tablist = mount.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();

    // Fire ArrowRight keydown event on tablist
    tablist?.dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      preventDefault: () => {},
    });

    // Wait for async update
    await new Promise((r) => setTimeout(r, 10));

    const tabsAfterRight = mount.querySelectorAll('[role="tab"]');
    // Second filter ("active") should now be selected
    expect(tabsAfterRight[1]?.getAttribute("aria-selected")).toBe("true");
    expect(tabsAfterRight[1]?.getAttribute("tabindex")).toBe("0");
    expect(tabsAfterRight[0]?.getAttribute("tabindex")).toBe("-1");

    // Fire ArrowLeft keydown event on tablist
    tablist?.dispatchEvent({
      type: "keydown",
      key: "ArrowLeft",
      preventDefault: () => {},
    });

    await new Promise((r) => setTimeout(r, 10));

    const tabsAfterLeft = mount.querySelectorAll('[role="tab"]');
    // Should wrap back to "all" (index 0)
    expect(tabsAfterLeft[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabsAfterLeft[0]?.getAttribute("tabindex")).toBe("0");
  });

  it("handles Home and End key navigation across filter tabs", async () => {
    const { renderReferralsView } = await loadReferralsView();
    const mount = document.createElement("div") as unknown as MockElement;
    await renderReferralsView({ mount: mount as unknown as HTMLElement });

    const tablist = mount.querySelector('[role="tablist"]');

    // Fire End key event
    tablist?.dispatchEvent({
      type: "keydown",
      key: "End",
      preventDefault: () => {},
    });

    await new Promise((r) => setTimeout(r, 10));

    const tabsAfterEnd = mount.querySelectorAll('[role="tab"]');
    // Last filter ("reported", index 4) should be selected
    expect(tabsAfterEnd[4]?.getAttribute("aria-selected")).toBe("true");
    expect(tabsAfterEnd[4]?.getAttribute("tabindex")).toBe("0");

    // Fire Home key event
    tablist?.dispatchEvent({
      type: "keydown",
      key: "Home",
      preventDefault: () => {},
    });

    await new Promise((r) => setTimeout(r, 10));

    const tabsAfterHome = mount.querySelectorAll('[role="tab"]');
    // First filter ("all", index 0) should be selected
    expect(tabsAfterHome[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabsAfterHome[0]?.getAttribute("tabindex")).toBe("0");
  });
});
