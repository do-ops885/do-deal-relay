/**
 * D1 Query Type Definitions
 */

export interface DealSearchResult {
  id: number;
  deal_id: string;
  title: string;
  description: string;
  domain: string;
  code: string;
  url: string;
  reward_type: string;
  reward_value: number;
  reward_currency: string;
  status: string;
  category: string[];
  tags: string[];
  relevance?: number;
  expiry_date?: string;
  confidence_score: number;
}

export interface DealStats {
  total: number;
  active: number;
  quarantined: number;
  rejected: number;
  expired: number;
  byDomain: Array<{
    domain: string;
    count: number;
  }>;
  byCategory: Array<{
    name: string;
    count: number;
  }>;
  byRewardType: Array<{
    type: string;
    count: number;
  }>;
}

export interface ExpiringDealRow {
  id: number;
  deal_id: string;
  title: string;
  domain: string;
  expiry_date: string;
  days_remaining: number;
  code: string;
}

export interface ReferralCodeResult {
  id: number;
  code: string;
  deal_id: number;
  deal_title: string;
  domain: string;
  status: string;
  max_uses: number;
  current_uses: number;
  use_count: number;
  expires_at?: string;
  days_remaining?: number;
}
