/**
 * Runs the steps of a teardown one after the other, each bounded, so that a step that hangs fails the hook in seconds and
 * the message names it (a hosted run once lost 180 s to a silent `afterAll`). A failed or late step does not stop the
 * steps after it: the browser must still be killed when the server will not close. A step marked `warn` is reported on
 * stderr instead of failing the hook: for cleanup whose leftover the test process drops on exit anyway.
 */
export async function teardown(
  steps: Array<[name: string, run: () => unknown, options?: { warn?: boolean }]>,
  limitMs = 15_000,
): Promise<void> {
  const failures: string[] = [];
  for (const [name, run, options] of steps) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(run),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`did not finish within ${limitMs} ms`)), limitMs);
        }),
      ]);
    } catch (error) {
      const failure = `${name}: ${error instanceof Error ? error.message : String(error)}`;
      if (options?.warn) process.stderr.write(`teardown warning: ${failure}\n`);
      else failures.push(failure);
    } finally {
      clearTimeout(timer);
    }
  }
  if (failures.length > 0) throw new Error(`Teardown failed at ${failures.join('; ')}`);
}
