export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }

  throw lastError;
}
        