import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkSafety, checkResourceLimits, checkDataQuality, runGuardRails } from '../worker/lib/guard-rails';
import type { Deal } from '../worker/types';

const createMockDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'test-id',
  source: {
    url: 'https://example.com/invite',
    domain: 'example.com',
    discovered_at: '2024-03-31T00:00:00Z',
    trust_score: 0.7
  },
  title: 'Test Deal',
  description: 'Test description',
  code: 'CODE123',
  url: 'https://example.com/invite/CODE123',
  reward: {
    type: 'cash',
    value: 50,
    currency: 'USD'
  },
  expiry: {
    confidence: 0.8,
    type: 'soft'
  },
  metadata: {
    category: ['test'],
    tags: ['test'],
    normalized_at: '2024-03-31T00:00:00Z',
    confidence_score: 0.8,
    status: 'active'
  },
  ...overrides
});

describe('Guard Rails', () => {
  describe('checkSafety', () => {
    it('should pass for clean deals', async () => {
      const deal = createMockDeal();
      const result = await checkSafety(deal);
      expect(result.passed).toBe(true);
    });

    it('should detect XSS attempts', async () => {
      const deal = createMockDeal({ title: '<script>alert(1)</script>' });
      const result = await checkSafety(deal);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('XSS');
    });

    it('should detect dangerous URL schemes', async () => {
      const deal = createMockDeal({ url: 'javascript:alert(1)' });
      const result = await checkSafety(deal);
      expect(result.passed).toBe(false);
    });
  });

  describe('checkResourceLimits', () => {
    it('should pass for reasonable deal counts', () => {
      const deals = Array(100).fill(null).map(() => createMockDeal());
      const result = checkResourceLimits(deals);
      expect(result.passed).toBe(true);
    });

    it('should fail for too many deals', () => {
      const deals = Array(2000).fill(null).map((_, i) => 
        createMockDeal({ id: `id-${i}` })
      );
      const result = checkResourceLimits(deals);
      expect(result.passed).toBe(false);
    });
  });

  describe('checkDataQuality', () => {
    it('should pass for valid deals', () => {
      const deals = [createMockDeal()];
      const result = checkDataQuality(deals);
      expect(result.passed).toBe(true);
    });

    it('should fail for deals with empty fields', () => {
      const deals = [createMockDeal({ code: '' })];
      const result = checkDataQuality(deals);
      expect(result.passed).toBe(false);
    });
  });
});
