import { describe, it, expect, vi, beforeEach } from "vitest";

interface ShowDealDetail {
  (dealId: string): Promise<void>;
}

interface DealDetailMod {
  showDealDetail: ShowDealDetail;
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

class MockElement {
  tagName: string;
  className: string = "";
  dataset: Record<string, string> = {};
  private _innerHTML: string = "";
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Array<(event: unknown) => void>> = {};
  open: boolean = false;
  focused: boolean = false;
  private elementsCache: Map<string, MockElement> = new Map();

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    this.elementsCache.clear();
    if (this.onInnerHTMLChange) {
      this.onInnerHTMLChange(val);
    }
  }

  onInnerHTMLChange?: (val: string) => void;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  showModal(): void {
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.dispatchEvent({ type: "close" });
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {
    // no-op
  }

  querySelector(selector: string): Element | null {
    if (this.elementsCache.has(selector)) {
      return this.elementsCache.get(selector) as unknown as Element;
    }

    let pattern: RegExp | null = null;
    if (selector === "#deal-detail-title") {
      pattern = /<[^>]*id="deal-detail-title"[^>]*>/;
    } else if (selector === ".badge" || selector === ".badge--active") {
      pattern = /<[^>]*class="[^"]*\bbadge\b[^"]*"[^>]*>/;
    } else if (selector === ".deal-detail__copy") {
      pattern = /<[^>]*class="[^"]*\bdeal-detail__copy\b[^"]*"[^>]*>/;
    } else if (selector === ".deal-detail__content") {
      pattern = /<[^>]*class="[^"]*\bdeal-detail__content\b[^"]*"[^>]*>/;
    }

    if (pattern) {
      const attrs = findOpeningTag(this._innerHTML, pattern);
      if (attrs !== null) {
        const matched = new MockElement("div");
        for (const [k, v] of Object.entries(attrs)) {
          matched.setAttribute(k, v);
        }
        if (selector === ".deal-detail__content") {
          matched.onInnerHTMLChange = (newVal: string) => {
            this._innerHTML = this._innerHTML.replace(
              /<div class="deal-detail__content"[^>]*>[\s\S]*<\/div>/,
              `<div class="deal-detail__content" role="document">${newVal}</div>`,
            );
            this.elementsCache.clear();
          };
        }
        this.elementsCache.set(selector, matched);
        return matched as unknown as Element;
      }
    }
    return null;
  }

  addEventListener(event: string, fn: (event: unknown) => void): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]?.push(fn);
  }

  dispatchEvent(event: { type: string }): void {
    const listeners = this.eventListeners[event.type] || [];
    for (const fn of listeners) {
      fn(event);
    }
  }
}

describe("showDealDetail Accessibility & Attributes", () => {
  let createdDialogs: MockElement[] = [];

  beforeEach(() => {
    vi.resetModules();
    createdDialogs = [];
    const stubDocument = {
      activeElement: null,
      createElement: (tag: string): HTMLElement => {
        const el = new MockElement(tag);
        if (tag.toLowerCase() === "dialog") {
          createdDialogs.push(el);
        }
        return el as unknown as HTMLElement;
      },
      body: {
        appendChild: (_node: HTMLElement) => {},
      },
    };
    globalThis.document = stubDocument as unknown as Document;
  });

  it("should create dialog with aria-labelledby, aria-modal, formatted status badge and clean unescaped copy button aria-label", async () => {
    const apiMock = {
      getDeal: vi.fn().mockResolvedValue({
        id: "deal-1",
        title: "Test Deal & Offers",
        status: "active",
        code: "SAVE&WIN",
      }),
    };

    vi.doMock("../../public/js/api.js", () => ({
      api: apiMock,
    }));

    const mod =
      (await import("../../public/js/components/deal-detail.js")) as unknown as DealDetailMod;

    await mod.showDealDetail("deal-1");

    expect(createdDialogs.length).toBeGreaterThan(0);
    const dialog = createdDialogs[0];
    expect(dialog?.getAttribute("aria-labelledby")).toBe("deal-detail-title");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    const badge = dialog?.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("aria-label")).toBe("Status: Active");

    const copyBtn = dialog?.querySelector(".deal-detail__copy");
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.getAttribute("aria-label")).toBe(
      "Copy referral code SAVE&WIN to clipboard",
    );
    expect(copyBtn?.getAttribute("aria-label")).not.toContain("&amp;");
  });

  it("should capitalize unknown status strings in badge aria-label", async () => {
    const apiMock = {
      getDeal: vi.fn().mockResolvedValue({
        id: "deal-2",
        title: "Custom Status Deal",
        status: "quarantined",
      }),
    };

    vi.doMock("../../public/js/api.js", () => ({
      api: apiMock,
    }));

    const mod =
      (await import("../../public/js/components/deal-detail.js")) as unknown as DealDetailMod;

    await mod.showDealDetail("deal-2");

    const dialog = createdDialogs[0];
    const badge = dialog?.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("aria-label")).toBe("Status: Quarantined");
  });

  it("should set tabindex='-1' and focus heading on content load", async () => {
    const apiMock = {
      getDeal: vi.fn().mockResolvedValue({
        id: "deal-3",
        title: "Focus Test Deal",
        status: "active",
      }),
    };

    vi.doMock("../../public/js/api.js", () => ({
      api: apiMock,
    }));

    const mod =
      (await import("../../public/js/components/deal-detail.js")) as unknown as DealDetailMod;

    await mod.showDealDetail("deal-3");

    const dialog = createdDialogs[0];
    const titleEl = dialog?.querySelector(
      "#deal-detail-title",
    ) as unknown as MockElement;
    expect(titleEl).not.toBeNull();
    expect(titleEl?.getAttribute("tabindex")).toBe("-1");
    expect(titleEl?.focused).toBe(true);
  });
});
