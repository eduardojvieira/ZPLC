import { BOARD_OPTIONS, getZephyrBoardTarget } from '../config/boardProfiles';
import { parseDeviceHandshake, validateHardwareDeployAdmission } from '../runtime/deviceHandshake';

export interface HardwareDeployConfirmation {
  readonly projectBoard: string;
  readonly deviceBoard: string;
  readonly boardProfile: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly taskCount: number;
  readonly message: string;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Preflight the exact program bytes before a human can approve a hardware deploy. */
export async function createHardwareDeployConfirmation({
  bytecode,
  projectBoard,
  systemInfo,
  taskCount,
}: {
  bytecode: Uint8Array;
  projectBoard: string | undefined;
  systemInfo: unknown;
  taskCount: number;
}): Promise<HardwareDeployConfirmation> {
  const handshake = parseDeviceHandshake(systemInfo);
  validateHardwareDeployAdmission(bytecode, projectBoard, handshake);
  const zephyrBoard = getZephyrBoardTarget(projectBoard);
  const option = BOARD_OPTIONS.find((board) => board.value === projectBoard);
  if (!zephyrBoard || !option || !Number.isSafeInteger(taskCount) || taskCount < 1) {
    throw new Error('ZPLC_DEVICE_ARTIFACT_INVALID');
  }
  const digestInput = new Uint8Array(bytecode.byteLength);
  digestInput.set(bytecode);
  const sha256 = hex(await globalThis.crypto.subtle.digest('SHA-256', digestInput.buffer));
  const byteLength = bytecode.byteLength;
  const message = [
    'Confirm PLC program deploy.',
    `Project board: ${option.label} (${zephyrBoard})`,
    `Device board: ${handshake.board}`,
    `Device board profile: ${handshake.boardProfile}`,
    `Payload SHA-256: ${sha256}`,
    `Payload size: ${byteLength} bytes; tasks: ${taskCount}`,
    'Deploy stops the current PLC program and leaves the runtime stopped. This does not prove hardware or HIL behavior.',
  ].join('\n');
  return { projectBoard: option.label, deviceBoard: handshake.board, boardProfile: handshake.boardProfile, sha256, byteLength, taskCount, message };
}
