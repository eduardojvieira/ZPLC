import { describe, expect, it } from 'bun:test';

import { DEBUG_CAPABILITY_MODE, getDebugCapabilities } from './debugCapabilities';
import type { SystemInfo } from './serialAdapter';

const BASE_INFO: SystemInfo = {
  board: 'esp32s3_devkitc',
  zplc_version: '1.0.0',
  zephyr_version: '4.0.0',
  uptime_ms: 1000,
  cpu_freq_mhz: 240,
  capabilities: {
    fpu: true,
    mpu: true,
    scheduler: false,
    max_tasks: 8,
  },
  memory: {
    work_size: 8192,
    retain_size: 4096,
    ipi_size: 4096,
    opi_size: 4096,
  },
};

describe('getDebugCapabilities', () => {
  it('treats scheduler devices as debugger-capable', () => {
    const result = getDebugCapabilities({
      ...BASE_INFO,
      capabilities: { ...BASE_INFO.capabilities, scheduler: true },
    });

    expect(result.mode).toBe(DEBUG_CAPABILITY_MODE.SCHEDULER);
    expect(result.supportsPause).toBe(true);
    expect(result.supportsResume).toBe(true);
    expect(result.supportsStep).toBe(true);
    expect(result.supportsBreakpoints).toBe(true);
  });

  it('treats non-scheduler devices as legacy debugger-capable', () => {
    const result = getDebugCapabilities(BASE_INFO);

    expect(result.mode).toBe(DEBUG_CAPABILITY_MODE.LEGACY);
    expect(result.supportsPause).toBe(true);
    expect(result.supportsResume).toBe(true);
    expect(result.supportsStep).toBe(true);
    expect(result.supportsBreakpoints).toBe(true);
  });
});
