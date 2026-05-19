export class ResearchRateLimiter {
  private requests: Map<string, number[]> = new Map();
  constructor(private maxRequests: number = 10, private windowMs: number = 60000) {}
  canMakeRequest(source: string): boolean {
    const now = Date.now();
    const requests = (this.requests.get(source) || []).filter(t => now - t < this.windowMs);
    this.requests.set(source, requests);
    return requests.length < this.maxRequests;
  }
  recordRequest(source: string): void {
    const requests = this.requests.get(source) || [];
    requests.push(Date.now());
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
