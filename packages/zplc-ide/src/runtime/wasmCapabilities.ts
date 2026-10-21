/**
 * What the WebAssembly runtime can and cannot do, in the vocabulary of the native session contract (spec 009,
 * contracts/native-runtime-session.md): one entry per feature, `supported`, `degraded` or `unavailable`, and for the
 * last two the reason and what to do instead. It is the one place the browser runtime states its limits: the
 * handshake reports it, the controller reads the actions it allows from it, the status bar shows its label, and the
 * documentation check of capability claims takes the browser simulator's availability from it (IDE-025, DOC-012).
 *
 * The runtime is the session of the native runtime compiled to WebAssembly (tools/wasm-core), so the execution
 * semantics of a scan are the same code. What differs is the host: a browser has no pins, no sockets and no serial
 * port to give it, and its timers are not a real-time clock. Every `unavailable` entry below is one the module
 * itself refuses (a test runs it); nothing here says the browser behaves like a controller.
 */
import type { NativeCapabilityProfile } from './nativeProtocol';

/** The `runtime_kind` of the handshake of the WebAssembly runtime; the native one reports `native-posix`. */
export const WASM_RUNTIME_KIND = 'wasm';

export const WASM_PROFILE_ID = 'wasm-browser';

/** Where the RETAIN records of the runtime go: the open project's folder, or the memory of the page. */
export type WasmRetainStorage = 'project' | 'memory';

const NATIVE_ACTION = 'Use the native simulation of the desktop app, or a hardware session.';

export function wasmCapabilityProfile(storage: WasmRetainStorage = 'project'): NativeCapabilityProfile {
  return {
    profile_id: WASM_PROFILE_ID,
    features: [
      { name: 'pause', status: 'supported' },
      { name: 'resume', status: 'supported' },
      { name: 'step', status: 'supported' },
      { name: 'breakpoints', status: 'supported' },
      { name: 'simulation-inputs', status: 'supported' },
      {
        name: 'tasks',
        status: 'degraded',
        reason:
          'Cyclic tasks run on the scheduler core of the firmware, but the browser releases them from its own timers; event and ' +
          'interrupt tasks do not exist in simulation.',
        recommended_action: 'Confirm task timing and deadline behaviour on hardware.',
      },
      {
        name: 'timing',
        status: 'degraded',
        reason:
          'The scan period follows the browser clock and its timers, which are throttled in a background tab and have no real-time ' +
          'guarantee: a scan can run late and a deadline miss reports the browser, not the target. What is deterministic is the result ' +
          'of each scan, not when it happens.',
        recommended_action: 'Use a scenario with a virtual clock in the native simulation for timing, or hardware.',
      },
      storage === 'project'
        ? {
            name: 'retentive-memory',
            status: 'degraded',
            reason:
              'RETAIN follows the same rules as the firmware (checksum, layout, program identity, two alternating records), and the ' +
              'records are written to the build folder of the open project after the scan that saves them: closing the page between ' +
              'the save and the write can lose that one record, and the previous one stays valid.',
            recommended_action: 'Confirm power-cycle behaviour of retained values on hardware.',
          }
        : {
            name: 'retentive-memory',
            status: 'degraded',
            reason:
              'No project folder is open, so RETAIN records live in the memory of this page and are gone when it closes. The rules are ' +
              'the same as the firmware; the storage is not.',
            recommended_action: 'Open a project folder, or use the native simulation.',
          },
      {
        name: 'modbus',
        status: 'unavailable',
        reason: 'A browser module has no network: every Modbus block answers STATUS 10 (UNAVAILABLE).',
        recommended_action: NATIVE_ACTION,
      },
      {
        name: 'mqtt',
        status: 'unavailable',
        reason: 'A browser module has no network: every MQTT block answers STATUS 10 (UNAVAILABLE).',
        recommended_action: NATIVE_ACTION,
      },
      {
        name: 'cloud',
        status: 'unavailable',
        reason: 'A browser module has no network: the Azure, AWS and Sparkplug blocks answer STATUS 10 (UNAVAILABLE).',
        recommended_action: NATIVE_ACTION,
      },
      {
        name: 'serial',
        status: 'unavailable',
        reason: 'The WebAssembly runtime has no serial port and does not speak the device link: it is a simulation, not a controller.',
        recommended_action: 'Connect a controller in Hardware mode.',
      },
      {
        name: 'physical-io',
        status: 'unavailable',
        reason: 'There are no pins: inputs and outputs are the process image that ZPLC reads and writes.',
        recommended_action: 'Wire the project to a board in a hardware session.',
      },
    ],
  };
}
