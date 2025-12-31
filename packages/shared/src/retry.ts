interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  retryOn?: (error: unknown) => boolean;
}

function extractRetryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  
  const err = error as Record<string, unknown>;
  
  if (err.headers && typeof err.headers === "object") {
    const headers = err.headers as Record<string, unknown>;
    const retryAfter = headers["retry-after"];
    if (typeof retryAfter === "string") {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) return Math.ceil(seconds * 1000);
    }
    if (typeof retryAfter === "number") return Math.ceil(retryAfter * 1000);
  }
  
  return null;
}

function isRateLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as Record<string, unknown>;
  if (err.status === 429) return true;
  if (typeof err.message === "string" && err.message.includes("rate_limit")) return true;
  return false;
}

const defaultRetryOn = (error: unknown): boolean => {
  if (isRateLimitError(error)) return true;
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  return true;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const delay = options.delay ?? 1000;
  const backoff = options.backoff ?? 2;
  const retryOn = options.retryOn ?? defaultRetryOn;

  let lastError: unknown;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === retries || !retryOn(error)) {
        throw error;
      }

      let waitTime = delay * Math.pow(backoff, attempt);
      
      const retryAfter = extractRetryAfter(error);
      if (retryAfter !== null && retryAfter > waitTime) {
        waitTime = retryAfter + 500;
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
}
