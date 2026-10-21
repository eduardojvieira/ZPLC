import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'bun:test';

// The binary that the native-runtime tests drive: CI exports ZPLC_NATIVE_SIM_BIN, a local build is in firmware/lib/zplc_core/build.
export const nativeRuntimeBinary =
  process.env.ZPLC_NATIVE_SIM_BIN ?? fileURLToPath(new URL('../../../../firmware/lib/zplc_core/build/zplc_runtime', import.meta.url));

const found = existsSync(nativeRuntimeBinary);
const inCi = !['', '0', 'false'].includes(process.env.CI ?? '');

// A local run without the binary skips these tests and says so once, with the way to run them: nobody mistakes the skips for passes.
if (!found && !inCi) {
  console.warn(
    `native runtime binary not found: ${nativeRuntimeBinary}. The tests that need it are skipped here and fail in CI; build it with ` +
      `\`bun run build:runtime\` or export ZPLC_NATIVE_SIM_BIN.`,
  );
}

// Registers a test that needs nativeRuntimeBinary. Without the binary it is skipped on a developer machine,
// but in CI it is a failing test: a skipped test is a pass nobody sees (VF-023).
export const itNative = (
  found || !inCi
    ? it.skipIf(!found)
    : (name: string) =>
        it(name, () => {
          throw new Error(
            `native runtime binary not found: ${nativeRuntimeBinary} (CI is set); build zplc_runtime and export ZPLC_NATIVE_SIM_BIN`,
          );
        })
) as ReturnType<typeof it.skipIf>;
