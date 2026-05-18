
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyWebhookSignature, generateHmacSignature } from '../../worker/lib/hmac';

describe('Webhook Security - Unified Verification', () => {
  const secret = 'test-secret';

  it('should reject requests with missing headers', async () => {
    const request = new Request('https://api.example.com/webhook', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    });

    const result = await verifyWebhookSignature(request, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing signature or timestamp headers');
  });

  it('should reject requests with invalid signature format', async () => {
    const request = new Request('https://api.example.com/webhook', {
      method: 'POST',
      headers: {
        'X-Webhook-Signature': 'invalid-format',
        'X-Webhook-Timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: JSON.stringify({ data: 'test' }),
    });

    const result = await verifyWebhookSignature(request, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature header format');
  });

  it('should reject requests with expired timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ data: 'test' });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
    const signature = await generateHmacSignature(payload, secret, oldTimestamp);

    const request = new Request('https://api.example.com/webhook', {
      method: 'POST',
      headers: {
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': oldTimestamp.toString(),
      },
      body: payload,
    });

    const result = await verifyWebhookSignature(request, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Webhook timestamp too old');
  });

  it('should reject requests with invalid HMAC signature', async () => {
    const payload = JSON.stringify({ data: 'test' });
    const timestamp = Math.floor(Date.now() / 1000);

    const request = new Request('https://api.example.com/webhook', {
      method: 'POST',
      headers: {
        'X-Webhook-Signature': `sha256=incorrectsignature`,
        'X-Webhook-Timestamp': timestamp.toString(),
      },
      body: payload,
    });

    const result = await verifyWebhookSignature(request, secret);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('should accept requests with valid signature and timestamp', async () => {
    const payload = JSON.stringify({ data: 'test' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateHmacSignature(payload, secret, timestamp);

    const request = new Request('https://api.example.com/webhook', {
      method: 'POST',
      headers: {
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': timestamp.toString(),
      },
      body: payload,
    });

    const result = await verifyWebhookSignature(request, secret);
    expect(result.valid).toBe(true);
  });
});
