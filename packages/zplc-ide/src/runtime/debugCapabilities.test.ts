import { describe, expect, it } from 'bun:test';

import {
  DEBUG_CAPABILITY_MODE,
  DEBUG_CAPABILITY_STATUS,
  getDebugCapabilities,
  getDebugCapabilitiesFromProfile,
  getLegacyWasmCapabilities,
} from './debugCapabilities';
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

  it('maps native capability profiles into debug capability states', () => {
    const result = getDebugCapabilitiesFromProfile({
      profile_id: 'cap-01',
      features: [
        { name: 'pause', status: 'supported' },
        { name: 'resume', status: 'supported' },
        { name: 'step', status: 'degraded', reason: 'single-cycle only' },
        { name: 'breakpoints', status: 'unavailable', reason: 'not loaded' },
      ],
    });

    expect(result.mode).toBe(DEBUG_CAPABILITY_MODE.SCHEDULER);
    expect(result.supportsPause).toBe(true);
    expect(result.supportsResume).toBe(true);
    expect(result.supportsStep).toBe(false);
    expect(result.supportsBreakpoints).toBe(false);
    expect(result.features.step.status).toBe(DEBUG_CAPABILITY_STATUS.DEGRADED);
    expect(result.features.breakpoints.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
  });

  it('treats missing native features as unavailable instead of pretending support', () => {
    const result = getDebugCapabilitiesFromProfile({
      profile_id: 'cap-02',
      features: [{ name: 'pause', status: 'supported' }],
    });

    expect(result.features.pause.status).toBe(DEBUG_CAPABILITY_STATUS.SUPPORTED);
    expect(result.features.resume.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
    expect(result.features.step.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
    expect(result.features.breakpoints.status).toBe(DEBUG_CAPABILITY_STATUS.UNAVAILABLE);
  });

  it('marks legacy WASM simulation semantics as degraded fallback behavior', () => {
    const result = getLegacyWasmCapabilities();

    expect(result.mode).toBe(DEBUG_CAPABILITY_MODE.LEGACY);
    expect(result.supportsPause).toBe(false);
    expect(result.supportsResume).toBe(false);
    expect(result.supportsStep).toBe(false);
    expect(result.supportsBreakpoints).toBe(false);
    expect(result.features.pause.status).toBe(DEBUG_CAPABILITY_STATUS.DEGRADED);
    expect(result.features.step.recommendedAction).toBe(
      'Prefer native simulation or hardware for authoritative stepping',
    );
  });
});
