// The port interface page lists every function of the HAL and every callback of the scheduler port, and cannot miss one
// (IO-013). The page is generated from the headers, so these tests drive the readers of the headers, not the page text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { groupedFunctions, halFunctions, portInterfaceBody, schedulerPort } from './generate_port_interface';

const ROOT = new URL('../../', import.meta.url).pathname;
const header = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('port interface page: every function of the HAL and every callback of the scheduler port is on it (IO-013, stopgap: the WebAssembly runtime has no scheduler, timing or storage leg yet)', () => {
  it('reads the declared functions of the HAL header, in declaration order, each with its first sentence', () => {
    const functions = halFunctions(header('firmware/lib/zplc_core/include/zplc_hal.h'));
    expect(functions.map((entry) => entry.name).slice(0, 2)).toEqual(['zplc_hal_tick', 'zplc_hal_sleep']);
    expect(functions.length).toBeGreaterThanOrEqual(29);
    expect(functions.every((entry) => entry.brief.length > 5)).toBe(true);
  });

  it('puts every declared function in a group, and refuses one that no group claims', () => {
    const functions = halFunctions(header('firmware/lib/zplc_core/include/zplc_hal.h'));
    expect(groupedFunctions(functions).flatMap((entry) => entry.functions).map((entry) => entry.name).sort()).toEqual(functions.map((entry) => entry.name).sort());
    expect(() => groupedFunctions([...functions, { name: 'zplc_hal_teleport', brief: 'Moves the board.' }])).toThrow('zplc_hal_teleport');
  });

  it('reads every callback of zplc_sched_port_t, the second half of a pair included', () => {
    const names = schedulerPort(header('firmware/lib/zplc_core/include/zplc_sched_core.h')).map((entry) => entry.name);
    expect(names).toContain('now_us');
    expect(names).toEqual(expect.arrayContaining(['enter', 'leave', 'lock_image', 'unlock_image', 'lock_io', 'unlock_io', 'drive_safe_pins', 'watchdog_state', 'fault_latched']));
  });

  it('names every category of the suite and every port in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const body = portInterfaceBody(lang);
      for (const name of ['test_port_timing', 'zplc.port_timing', 'test_sched_core', 'zplc.core.loader_verify', 'wasmParity.test.ts']) expect(body).toContain(name);
    }
  });
});
