import { BOARD_OPTIONS, getZephyrBoardTarget } from '../config/boardProfiles';
import { connectionManager } from '../runtime/connectionManager';
import { parseDeviceHandshake, validateHardwareDeployAdmission } from '../runtime/deviceHandshake';

export interface HardwareDeployConfirmation {
  readonly projectBoard: string;
  readonly deviceBoard: string;
  readonly boardProfile: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly taskCount: number;
  /** The largest program the device accepts, when it said so (COM-028). */
  readonly deviceCapacityBytes: number | null;
  /** How the program travels: the checked framed link, or the text shell, which reads nothing back. */
  readonly transfer: 'framed' | 'text-shell';
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
  transfer = connectionManager.linkInfo.firmware?.protocol.kind === 'framed' ? 'framed' : 'text-shell',
}: {
  bytecode: Uint8Array;
  projectBoard: string | undefined;
  systemInfo: unknown;
  taskCount: number;
  transfer?: 'framed' | 'text-shell';
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
    ...(handshake.io ? [`Device I/O description: ${handshake.io.boardId} (hash ${handshake.io.hash}, ${handshake.io.channels} channels)`] : []),
    `Payload SHA-256: ${sha256}`,
    `Payload size: ${byteLength} bytes${handshake.maxArtifactBytes === null ? '' : ` of the ${handshake.maxArtifactBytes} this device accepts`}; tasks: ${taskCount}`,
    transfer === 'framed'
      ? 'Transfer: the device link. The chunks go in order, and the device reports the size and CRC-32 of what it holds, which have to be the ones announced.'
      : 'Transfer: the text shell of an older firmware. The device answers each line; the program is not read back.',
    'Deploy stops the current PLC program and leaves the runtime stopped; Run is a separate action. This does not prove hardware or HIL behavior.',
  ].join('\n');
  return {
    projectBoard: option.label, deviceBoard: handshake.board, boardProfile: handshake.boardProfile, sha256, byteLength, taskCount,
    deviceCapacityBytes: handshake.maxArtifactBytes, transfer, message,
  };
}
