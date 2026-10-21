import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'bun:test';

// The native runtime these tests drive: ZPLC_NATIVE_SIM_BIN, or a local build in firmware/lib/zplc_core/build.
// Without it a test is skipped on a developer machine and fails in CI, where a skipped test is a pass nobody sees.
export const nativeRuntime =
  process.env.ZPLC_NATIVE_SIM_BIN ?? fileURLToPath(new URL('../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));
const found = existsSync(nativeRuntime);
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');

export const itNative = (
  found || !inCi
    ? it.skipIf(!found)
    : (name: string) =>
        it(name, () => {
          throw new Error(
            `native runtime binary not found: ${nativeRuntime} (CI is set); build zplc_runtime and export ZPLC_NATIVE_SIM_BIN`,
          );
        })
) as ReturnType<typeof it.skipIf>;
