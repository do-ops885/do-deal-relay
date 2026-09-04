import { describe, it, expect, vi, beforeEach } from "vitest";

interface DealInput {
  id?: string;
  title?: string;
  source?: string;
  description?: string;
  category?: string;
  status?: string;
  confidence?: number;
}

type OnSelect = (deal: DealInput) => void;

type CreateDealCard = (
  deal: DealInput,
  options?: { onSelect?: OnSelect },
) => HTMLElement;

async function loadCreateDealCard(): Promise<CreateDealCard> {
  const mod =
    (await import("../../public/js/components/deal-card.js")) as unknown as {
      createDealCard: CreateDealCard;
    };
  return mod.createDealCard;
}

interface MockEvent {
  type: string;
  key?: string;
  preventDefault?: () => void;
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null = attrPattern.exec(tag);
  while (match !== null) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      attrs[name] = value;
    }
    match = attrPattern.exec(tag);
  }
  return attrs;
}

function findOpeningTag(
  html: string,
  pattern: RegExp,
): Record<string, string> | null {
  const tagMatch = pattern.exec(html);
  if (tagMatch === null) {
    return null;
  }
  const tag = tagMatch[0];
  if (tag === undefined) {
    return null;
  }
  return parseTagAttributes(tag);
}

class MockDomNode {
  protected readonly attrs: Record<string, string>;

  constructor(attrs: Record<string, string>) {
    this.attrs = attrs;
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
}

class MockElement extends MockDomNode {
  tagName: string;
  className: string = "";
  tabIndex: number = -1;
  dataset: Record<string, string> = {};
  innerHTML: string = "";
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Array<(event: MockEvent) => void>> = {};

  constructor(tagName: string) {
    super({});
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  override getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  querySelector(selector: string): Element | null {
    if (selector === '[role="meter"]') {
      const attrs = findOpeningTag(
        this.innerHTML,
        /<[^>]*\brole="meter"[^>]*>/,
      );
      if (attrs === null) {
        return null;
      }
      return new MockDomNode(attrs) as unknown as Element;
    }
    if (selector === ".deal-card__confidence-track") {
      const attrs = findOpeningTag(
        this.innerHTML,
        /<[^>]*\bdeal-card__confidence-track[^>]*>/,
      );
      if (attrs === null) {
        return null;
      }
      return new MockDomNode(attrs) as unknown as Element;
    }
    return null;
  }

  addEventListener(event: string, fn: (event: MockEvent) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    const listeners = this.eventListeners[event];
    if (listeners !== undefined) {
      listeners.push(fn);
    }
  }

  dispatchEvent(event: MockEvent): void {
    const listeners = this.eventListeners[event.type] || [];
    for (const fn of listeners) {
      fn(event);
    }
  }

  click(): void {
    this.dispatchEvent({ type: "click" });
  }
}

describe("createDealCard Accessibility & Attributes", () => {
  beforeEach(() => {
    const stubDocument = {
      createElement: (tag: string): HTMLElement =>
        new MockElement(tag) as unknown as HTMLElement,
    };
    globalThis.document = stubDocument as unknown as Document;
  });

  it("should set unescaped plain text in aria-label when title contains special characters", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-123",
      title: "AT&T 20% Off & Free 'Tech' Shipping",
      source: "store & Co.",
      description: "Get 20% off",
      category: "shopping",
      status: "active",
    };

    const card = createDealCard(deal);
    const ariaLabel = card.getAttribute("aria-label");

    expect(ariaLabel).toBe(
      "View deal: AT&T 20% Off & Free 'Tech' Shipping from store & Co.",
    );
    expect(ariaLabel).not.toContain("&amp;");
    expect(ariaLabel).not.toContain("&#39;");
  });

  it("should maintain role='button' and tabindex='0' for interactive card", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-456",
      title: "Simple Deal",
      source: "example.com",
    };

    const card = createDealCard(deal);

    expect(card.getAttribute("role")).toBe("button");
    expect(card.tabIndex).toBe(0);
    expect(card.dataset.dealId).toBe("deal-456");
  });

  it("should invoke onSelect on click or Enter/Space keydown", async () => {
    const createDealCard = await loadCreateDealCard();
    const onSelect = vi.fn();
    const deal: DealInput = {
      id: "deal-789",
      title: "Clickable Deal",
      source: "example.com",
    };

    const card = createDealCard(deal, { onSelect });
    const mockCard = card as unknown as MockElement;

    mockCard.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(deal);

    let prevented = false;
    const enterEvent: MockEvent = {
      type: "keydown",
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    };
    (card as unknown as MockElement).dispatchEvent(enterEvent);
    expect(prevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(2);

    prevented = false;
    mockCard.dispatchEvent({
      type: "keydown",
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("should render confidence indicator with role='meter' and ARIA range attributes when confidence is present", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-confidence",
      title: "Confidence Deal",
      source: "example.com",
      confidence: 0.85,
    };

    const card = createDealCard(deal);
    const meter = card.querySelector('[role="meter"]');

    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuemin")).toBe("0");
    expect(meter?.getAttribute("aria-valuemax")).toBe("100");
    expect(meter?.getAttribute("aria-valuenow")).toBe("85");
    expect(meter?.getAttribute("aria-valuetext")).toBe("85% match");
    // Accessible name must match the visible label text (WCAG 2.5.3).
    expect(meter?.getAttribute("aria-label")).toBe("85% match");
    expect(
      card
        .querySelector(".deal-card__confidence-track")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("should not render a meter element when confidence is undefined", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-no-confidence",
      title: "No Confidence Deal",
      source: "example.com",
    };

    const card = createDealCard(deal);

    expect(card.querySelector('[role="meter"]')).toBeNull();
  });

  it("should render aria-valuenow='0' when confidence is 0", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-zero-confidence",
      title: "Zero Confidence Deal",
      source: "example.com",
      confidence: 0,
    };

    const card = createDealCard(deal);
    const meter = card.querySelector('[role="meter"]');

    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuenow")).toBe("0");
    expect(meter?.getAttribute("aria-valuetext")).toBe("0% match");
    expect(meter?.getAttribute("aria-label")).toBe("0% match");
  });

  it("should clamp aria-valuenow to '100' when confidence exceeds 1", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-over-confidence",
      title: "Over Confidence Deal",
      source: "example.com",
      confidence: 1.5,
    };

    const card = createDealCard(deal);
    const meter = card.querySelector('[role="meter"]');

    expect(meter).not.toBeNull();
    expect(meter?.getAttribute("aria-valuenow")).toBe("100");
    expect(meter?.getAttribute("aria-valuetext")).toBe("100% match");
    expect(meter?.getAttribute("aria-label")).toBe("100% match");
  });

  it("should not render a meter element when confidence is NaN", async () => {
    const createDealCard = await loadCreateDealCard();
    const deal: DealInput = {
      id: "deal-nan-confidence",
      title: "NaN Confidence Deal",
      source: "example.com",
      confidence: NaN,
    };

    const card = createDealCard(deal);

    expect(card.querySelector('[role="meter"]')).toBeNull();
  });
});
