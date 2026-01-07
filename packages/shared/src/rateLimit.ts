let lastCall = 0;

export async function rateLimitedCall<T>(
  fn: () => Promise<T>,
  minIntervalMs = 300
): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, minIntervalMs - (now - lastCall));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCall = Date.now();
  return fn();
}
