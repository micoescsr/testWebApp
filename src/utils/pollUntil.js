// src/utils/pollUntil.js
// Generic polling utility with AbortController support.
// Returns the first response where `isDone(data)` returns true,
// or throws on timeout / abort / maxAttempts.

/**
 * @param {() => Promise<T>}  fetcher   — async fn that returns data each tick
 * @param {(data: T) => boolean} isDone — predicate: return true to stop
 * @param {object}  opts
 * @param {number}  [opts.interval=2500]     — ms between polls
 * @param {number}  [opts.maxAttempts=120]   — safety cap
 * @param {AbortSignal} [opts.signal]        — external abort signal
 * @returns {Promise<T>} the terminal data
 */
export async function pollUntil(fetcher, isDone, opts = {}) {
  const { interval = 2500, maxAttempts = 120, signal } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Poll aborted', 'AbortError');
    }

    const data = await fetcher();

    if (isDone(data)) return data;

    // Wait, but respect abort
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, interval);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Poll aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        // Clean up listener when timer fires normally
        const origResolve = resolve;
        resolve = () => {
          signal.removeEventListener('abort', onAbort);
          origResolve();
        };
      }
    });
  }

  throw new Error(`pollUntil: max attempts (${maxAttempts}) exceeded`);
}
