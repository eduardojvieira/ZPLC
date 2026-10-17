import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import { createHardwareDeployConfirmation, gatherDeployFacts } from './hardwareDeployConfirmation';
import { ZPLC_CONSTANTS, createMultiTaskZplcFile } from '@zplc/compiler';

function artifact(): Uint8Array {
  const bytes = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, ZPLC_CONSTANTS.VERSION_MAJOR, true);
  view.setUint16(6, ZPLC_CONSTANTS.VERSION_MINOR, true);
  view.setUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, ZPLC_CONSTANTS.DRAFT_COUNTER, true);
  return bytes;
}

const systemInfo = {
  board: 'stm32f746g_disco',
  board_profile: 'stm32f746g_disco/stm32f746xx',
  zplc_version: '1.0.0', zephyr_version: '4.0.0', uptime_ms: 0, cpu_freq_mhz: 216,
  device_protocol_version: 1, bytecode_abi_major: 1, bytecode_abi_minor: 0,
  draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
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
    expect(confirmation.sha256).toBe(createHash('sha256').update(artifact()).digest('hex'));
    // The dialog compares the same facts (UX-019): project on one side, the device on the other.
    expect(confirmation.facts.project).toMatchObject({ board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', byteLength: ZPLC_CONSTANTS.HEADER_SIZE, taskCount: 2, sha256: confirmation.sha256 });
    expect(confirmation.facts.device).toMatchObject({ board: 'stm32f746g_disco', zplcVersion: '1.0.0', abi: { major: 1, minor: 0 }, draft: ZPLC_CONSTANTS.DRAFT_COUNTER, maxTasks: 4 });
  });

  it('states the size against what the device accepts, and how the program travels (COM-028)', async () => {
    const withCapacity = { ...systemInfo, memory: { ...systemInfo.memory, code_size: 4096, max_artifact_size: 4096 } };
    const framed = await createHardwareDeployConfirmation({
      bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo: withCapacity, taskCount: 1, transfer: 'framed',
    });
    expect(framed).toMatchObject({ deviceCapacityBytes: 4096, transfer: 'framed' });
    expect(framed.facts.device?.maxArtifactBytes).toBe(4096);
    expect(framed.facts.project.byteLength).toBe(ZPLC_CONSTANTS.HEADER_SIZE);
    expect(framed.facts.transfer).toBe('framed');
    const shell = await createHardwareDeployConfirmation({
      bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 1, transfer: 'text-shell',
    });
    expect(shell.deviceCapacityBytes).toBeNull();
    expect(shell.facts.transfer).toBe('text-shell');
    expect(shell.facts.device?.maxArtifactBytes).toBeNull();
  });

  it('shows the safe value that the artifact carries for an output, by its address, and says that every other output is off (RT-023)', async () => {
    const bytecode = createMultiTaskZplcFile(
      new Uint8Array([0x00]), [{ id: 0, type: 0, priority: 1, intervalUs: 10000, entryPoint: 0, stackSize: 32, callDepth: 8 }], undefined,
      [{ offset: 0, bit: 1, value: 1 }, { offset: 0, bit: 3, value: 0 }],
    );
    const confirmation = await createHardwareDeployConfirmation({
      bytecode, projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 1,
    });
    expect(confirmation.declaredSafe).toEqual([{ address: '%QX0.1', value: true }, { address: '%QX0.3', value: false }]);
    expect(confirmation.facts.declaredSafe).toEqual(confirmation.declaredSafe);
  });

  it('says that every output is off in the safe state when the artifact carries no other value (RT-023)', async () => {
    const confirmation = await createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 1 });
    expect(confirmation.declaredSafe).toEqual([]);
    expect(confirmation.facts.declaredSafe).toEqual([]);
  });

  it('refuses a board on another contract draft before confirmation and names both numbers (CMP-052)', async () => {
    const board = { ...systemInfo, draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER + 1 };
    const refused = await createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo: board, taskCount: 1 })
      .catch((error: unknown) => error as { code: string; detail?: string });
    expect(refused).toMatchObject({
      code: 'ZPLC_DEVICE_BYTECODE_ABI_MISMATCH',
      detail: `Program was built for contract draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}, this runtime is draft ${ZPLC_CONSTANTS.DRAFT_COUNTER + 1}`,
    });
  });

  it('fails closed before confirmation for an unknown target, invalid handshake, or invalid artifact', async () => {
    await expect(createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'missing', systemInfo, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_PROJECT_TARGET_UNKNOWN');
    await expect(createHardwareDeployConfirmation({ bytecode: artifact(), projectBoard: 'stm32f746g_disco', systemInfo: null, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_HANDSHAKE_INVALID');
    await expect(createHardwareDeployConfirmation({ bytecode: new Uint8Array(2), projectBoard: 'stm32f746g_disco', systemInfo, taskCount: 1 })).rejects.toThrow('ZPLC_DEVICE_ARTIFACT_INVALID');
  });

  it('UX-019 gathers the facts of a deploy that admission refuses, so the dialog can show what does not match', async () => {
    const board = { ...systemInfo, board_profile: 'rpi_pico/rp2040', bytecode_abi_minor: 3 };
    const facts = await gatherDeployFacts({ bytecode: artifact(), projectBoard: 'stm32f746g_disco', projectName: 'Pump station', systemInfo: board, taskCount: 1 });
    expect(facts.project).toMatchObject({ name: 'Pump station', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR, minor: ZPLC_CONSTANTS.VERSION_MINOR } });
    expect(facts.device).toMatchObject({ boardProfile: 'rpi_pico/rp2040', abi: { major: 1, minor: 3 } });
  });

  it('UX-019 gathers facts without throwing when the device said nothing valid or the bytes are not an artifact', async () => {
    const nothing = await gatherDeployFacts({ bytecode: new Uint8Array(2), projectBoard: 'missing', systemInfo: null, taskCount: 1 });
    expect(nothing.device).toBeNull();
    expect(nothing.project).toMatchObject({ abi: null, boardProfile: null, board: 'missing', byteLength: 2 });
    expect(nothing.declaredSafe).toEqual([]);
  });
});
