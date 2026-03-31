import { describe, it, expect, beforeAll } from 'vitest';
import { normalize, verifyNormalization } from '../worker/pipeline/normalize';
import type { Deal, PipelineContext } from '../worker/types';

const createMockDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'test-id',
  source: {
    url: 'https://example.com/invite',
    domain: 'Example.COM',
    discovered_at: '2024-03-31T00:00:00Z',
    trust_score: 0.7
  },
  title: '  Test Deal  ',
  description: 'Test   description',
  code: 'code123',
  url: 'https://example.com/invite?ref=abc&utm_source=test',
  reward: {
    type: 'cash',
    value: 50,
    currency: 'usd'
  },
  expiry: {
    confidence: 0.8,
    type: 'soft'
  },
  metadata: {
    category: ['Test', 'REFERRAL'],
    tags: ['Test', 'EXAMPLE'],
    normalized_at: '',
    confidence_score: 0.8,
    status: 'active'
  },
  ...overrides
});

describe('Normalization Pipeline', () => {
  const ctx: PipelineContext = {
    run_id: 'test-run',
    trace_id: 'test-trace',
    start_time: Date.now(),
    candidates: [],
    normalized: [],
    deduped: [],
    validated: [],
    scored: [],
    errors: [],
    retry_count: 0
  };

  it('should normalize domain to lowercase', () => {
    const deals = [createMockDeal()];
    const normalized = normalize(deals, ctx);
    expect(normalized[0].source.domain).toBe('example.com');
  });

  it('should normalize code to uppercase', () => {
    const deals = [createMockDeal()];
    const normalized = normalize(deals, ctx);
    expect(normalized[0].code).toBe('CODE123');
  });

  it('should remove tracking parameters from URLs', () => {
    const deals = [createMockDeal()];
    const normalized = normalize(deals, ctx);
    expect(normalized[0].url).not.toContain('utm_source');
    expect(normalized[0].url).not.toContain('ref=abc');
  });

  it('should set normalized_at timestamp', () => {
    const deals = [createMockDeal()];
    const normalized = normalize(deals, ctx);
    expect(normalized[0].metadata.normalized_at).toBeTruthy();
  });

  describe('verifyNormalization', () => {
    it('should pass for valid normalized deals', () => {
      const deals = normalize([createMockDeal()], ctx);
      const result = verifyNormalization(deals);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid URL', () => {
      const deals = normalize([createMockDeal({ url: 'not-a-url' })], ctx);
      const result = verifyNormalization(deals);
      expect(result.valid).toBe(false);
    });
  });
});
