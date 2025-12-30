const DEFAULT_MIN_INTERVAL_MS = 2500;

class RateLimiter {
  private lastRequestTime = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS) {
    this.minIntervalMs = minIntervalMs;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    return fn();
  }
}

const groqRateLimiter = new RateLimiter(DEFAULT_MIN_INTERVAL_MS);

export async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  return groqRateLimiter.throttle(fn);
}

export { RateLimiter };
