export class ResearchRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(source: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(source) || [];

    const validRequests = requests.filter((time) => now - time < this.windowMs);

    return validRequests.length < this.maxRequests;
  }

  recordRequest(source: string): void {
    const now = Date.now();
    const requests = this.requests.get(source) || [];
    requests.push(now);
    this.requests.set(source, requests);
  }

  getTimeUntilNextWindow(source: string): number {
    const now = Date.now();
    const requests = this.requests.get(source) || [];

    if (requests.length === 0) return 0;

    const oldestRequest = Math.min(...requests);
    return Math.max(0, this.windowMs - (now - oldestRequest));
  }
}

export const researchRateLimiter = new ResearchRateLimiter(10, 60000);
