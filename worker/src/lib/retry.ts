export interface RetryOptions {
  /** Pause before each attempt. */
  intervalMs: number;
  /** Give up once this much time has passed. */
  maxWaitMs: number;
  /** Replaceable so tests need not really wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls `attempt` repeatedly, pausing before each call, until it returns a
 * non-empty list or the time allowed runs out. Returns the list, or an empty
 * one if it never produced anything.
 */
export async function retryUntilFound<T>(
  attempt: () => Promise<T[]>,
  { intervalMs, maxWaitMs, sleep = realSleep, now = Date.now }: RetryOptions,
): Promise<T[]> {
  const deadline = now() + maxWaitMs;
  while (now() + intervalMs <= deadline) {
    await sleep(intervalMs);
    const found = await attempt();
    if (found.length > 0) return found;
  }
  return [];
}
