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
