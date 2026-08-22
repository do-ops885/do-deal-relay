import { describe, it, expect, vi, beforeEach } from "vitest";

class MockElement {
  tagName: string;
  className: string = "";
  tabIndex: number = -1;
  dataset: Record<string, string> = {};
  innerHTML: string = "";
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Function[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, fn: Function) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(fn);
  }

  dispatchEvent(event: {
    type: string;
    key?: string;
    preventDefault?: Function;
  }) {
    const listeners = this.eventListeners[event.type] || [];
    for (const fn of listeners) {
      fn(event);
    }
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }
}

describe("createDealCard Accessibility & Attributes", () => {
  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
    };
  });

  it("should set unescaped plain text in aria-label when title contains special characters", async () => {
    // @ts-ignore
    const { createDealCard } =
      await import("../../public/js/components/deal-card.js");
    const deal = {
      id: "deal-123",
      title: "AT&T 20% Off & Free 'Tech' Shipping",
      source: "store & Co.",
      description: "Get 20% off",
      category: "shopping",
      status: "active",
    };

    const card = createDealCard(deal) as unknown as MockElement;
    const ariaLabel = card.getAttribute("aria-label");

    expect(ariaLabel).toBe(
      "View deal: AT&T 20% Off & Free 'Tech' Shipping from store & Co.",
    );
    expect(ariaLabel).not.toContain("&amp;");
    expect(ariaLabel).not.toContain("&#39;");
  });

  it("should maintain role='button' and tabindex='0' for interactive card", async () => {
    // @ts-ignore
    const { createDealCard } =
      await import("../../public/js/components/deal-card.js");
    const deal = {
      id: "deal-456",
      title: "Simple Deal",
      source: "example.com",
    };

    const card = createDealCard(deal) as unknown as MockElement;

    expect(card.getAttribute("role")).toBe("button");
    expect(card.tabIndex).toBe(0);
    expect(card.dataset.dealId).toBe("deal-456");
  });

  it("should invoke onSelect on click or Enter/Space keydown", async () => {
    // @ts-ignore
    const { createDealCard } =
      await import("../../public/js/components/deal-card.js");
    const onSelect = vi.fn();
    const deal = {
      id: "deal-789",
      title: "Clickable Deal",
      source: "example.com",
    };

    const card = createDealCard(deal, { onSelect }) as unknown as MockElement;

    card.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(deal);

    let prevented = false;
    card.dispatchEvent({
      type: "keydown",
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(2);

    prevented = false;
    card.dispatchEvent({
      type: "keydown",
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });
});
