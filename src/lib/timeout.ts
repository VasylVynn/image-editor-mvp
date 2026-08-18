// Races a promise against a timeout so a hanging upstream call can't keep the
// request open forever. The underlying promise isn't cancelled (the SDK calls
// take no signal) — its result is just discarded once the timeout wins.
export function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      AbortSignal.timeout(ms).addEventListener("abort", () => reject(new Error(timeoutMessage)), {
        once: true,
      });
    }),
  ]);
}
