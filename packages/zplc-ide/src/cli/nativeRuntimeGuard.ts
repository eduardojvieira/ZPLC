import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// The loopback peers (Modbus server, MQTT broker) of a simulation are the zplc_loopback program built next to zplc_runtime.
export const loopbackBinary = process.env.ZPLC_LOOPBACK_BIN ?? join(dirname(nativeRuntimeBinary), 'zplc_loopback');
const loopbackFound = found && existsSync(loopbackBinary);

// Registers a test that needs zplc_runtime and zplc_loopback. Windows does not build zplc_loopback (its sockets are
// POSIX: CMakeLists.txt, if(NOT WIN32)), so there the test is skipped and says why; elsewhere a missing binary is
// skipped on a developer machine and fails in CI, as for itNative.
export type LoopbackMode = 'run' | 'skip-platform' | 'fail' | 'skip';
// A missing zplc_runtime is never excused by the platform: only a runtime that is there and has no loopback peer is a platform skip (VF-023).
export const loopbackMode = (platform: string, runtimeFound: boolean, loopbackFound: boolean, ci: boolean): LoopbackMode =>
  loopbackFound ? 'run' : platform === 'win32' && runtimeFound ? 'skip-platform' : ci ? 'fail' : 'skip';

const mode = loopbackMode(process.platform, found, loopbackFound, inCi);
export const itNativeLoopback = (
  mode === 'run'
    ? it
    : mode === 'skip-platform'
      ? (name: string, ...rest: unknown[]) =>
          (it.skip as (...args: unknown[]) => unknown)(`${name} (zplc_loopback is not built on this platform)`, ...rest)
      : mode === 'fail'
        ? (name: string) =>
            it(name, () => {
              throw new Error(`zplc_runtime or zplc_loopback not found (${nativeRuntimeBinary}, ${loopbackBinary}); CI is set`);
            })
        : it.skip
) as ReturnType<typeof it.skipIf>;
