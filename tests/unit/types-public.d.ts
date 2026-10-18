declare module "*public/js/components/deal-card.js" {
  export function createDealCard(
    deal: {
      id?: string;
      title?: string;
      source?: string;
      description?: string;
      category?: string;
      status?: string;
      price?: string | number;
      confidence?: number;
      discountPercentage?: number;
      originalPrice?: string | number;
      expiresAt?: string;
    },
    options?: { onSelect?: (deal: any) => void },
  ): HTMLElement;
}

declare module "*public/js/components/deal-detail.js" {
  export function showDealDetail(dealId: string): Promise<void>;
  export function closeDealDetail(): void;
}

declare module "*public/js/deals.js" {
  export function renderDealsView(): Promise<HTMLElement>;
}

declare module "*public/js/referrals.js" {
  export function renderReferralsView(options?: {
    mount?: HTMLElement;
  }): Promise<HTMLElement | { element: HTMLElement; dispose: () => void }>;
}

declare module "*public/js/analytics.js" {
  export function renderAnalyticsView(options?: {
    mount?: HTMLElement;
  }): Promise<HTMLElement | { element: HTMLElement; dispose: () => void }>;
}
