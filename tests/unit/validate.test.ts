import { describe, it, expect } from 'vitest';
import { validate, calculateValidationRatio } from '../worker/pipeline/validate';
import type { Deal, PipelineContext, Env } from '../worker/types';

const createMockDeal = (id: string, overrides: Partial<Deal> = {}): Deal => ({
  id,
  source: {
    url: 'https://example.com/invite',
    domain: 'example.com',
    discovered_at: '2024-03-31T00:00:00Z',
    trust_score: overrides.source?.trust_score || 0.7
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
  }
});

describe('Validation Pipeline', () => {
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

  const mockEnv = {
    DEALS_PROD: {} as KVNamespace,
    DEALS_STAGING: {} as KVNamespace,
    DEALS_LOG: {} as KVNamespace,
    DEALS_LOCK: {} as KVNamespace,
    DEALS_SOURCES: {} as KVNamespace,
    ENVIRONMENT: 'test',
    GITHUB_REPO: 'test/repo',
    NOTIFICATION_THRESHOLD: '100'
  } as Env;

  it('should validate good deals', async () => {
    const deals = [createMockDeal('1')];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
  });

  it('should reject deals with low trust', async () => {
    const deals = [createMockDeal('1', { source: { trust_score: 0.1 } })];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('should quarantine high-value low-trust deals', async () => {
    const deals = [createMockDeal('1', { 
      source: { trust_score: 0.4 },
      reward: { type: 'cash', value: 150, currency: 'USD' }
    })];
    const result = await validate(deals, ctx, mockEnv);
    expect(result.quarantined.length).toBeGreaterThan(0);
  });

  it('should calculate validation ratio', () => {
    const result = {
      stats: {
        total: 10,
        valid: 8,
        quarantined: 1,
        invalid: 1,
        by_gate: {}
      },
      valid: [],
      invalid: [],
      quarantined: []
    };
    const ratio = calculateValidationRatio(result);
    expect(ratio).toBe(0.8);
  });
});
