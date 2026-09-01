import { describe, expect, it } from 'bun:test';

import { createHardwareDeployConfirmation } from './hardwareDeployConfirmation';
import { ZPLC_CONSTANTS } from '@zplc/compiler';

function artifact(): Uint8Array {
  const bytes = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, ZPLC_CONSTANTS.VERSION_MAJOR, true);
  view.setUint16(6, ZPLC_CONSTANTS.VERSION_MINOR, true);
  return bytes;
}

const systemInfo = {
  board: 'stm32f746g_disco',
  board_profile: 'stm32f746g_disco/stm32f746xx',
  zplc_version: '1.0.0', zephyr_version: '4.0.0', uptime_ms: 0, cpu_freq_mhz: 216,
  device_protocol_version: 1, bytecode_abi_major: 1, bytecode_abi_minor: 0,
  capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 },
  memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
};

describe('hardware deploy confirmation', () => {
  it('summarizes the exact admitted artifact without asserting hardware evidence', async () => {
    const confirmation = await createHardwareDeployConfirmation({
      bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 2,
    });

    expect(confirmation).toMatchObject({
      projectBoard: 'STM32F746G Discovery',
      deviceBoard: 'stm32f746g_disco',
      boardProfile: 'stm32f746g_disco/stm32f746xx',
      byteLength: ZPLC_CONSTANTS.HEADER_SIZE,
      taskCount: 2,
    });
    expect(confirmation.sha256).toBe('eebfe11a8c745e06ac8cdf4ba035fe0cd53559a3856a338c213cff07814ecb4c');
    expect(confirmation.message).toContain('stops the current PLC program and leaves the runtime stopped');
    expect(confirmation.message).toContain('does not prove hardware or HIL behavior');
  });

  it('fails closed before confirmation for an unknown target, invalid handshake, or invalid artifact', async () => {
    await expect(createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'missing', systemInfo, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_PROJECT_TARGET_UNKNOWN');
    await expect(createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo: null, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
    await expect(createHardwareDeployConfirmation({ bytecode: new Uint8Array(2), projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_ARTIFACT_INVALID');
  });
});
