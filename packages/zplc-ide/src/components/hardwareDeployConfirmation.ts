import { readArtifact } from '@zplc/compiler';

import { BOARD_OPTIONS, getZephyrBoardTarget } from '../config/boardProfiles';
import { connectionManager } from '../runtime/connectionManager';
import { parseDeviceHandshake, parseDeviceSystemInfo, readArtifactAbi, validateHardwareDeployAdmission } from '../runtime/deviceHandshake';

import type { DeployFacts } from './deployComparison';

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
  /** The safe values that the artifact carries, as the device will apply them; an output not listed is off (RT-023). */
  readonly declaredSafe: ReadonlyArray<{ readonly address: string; readonly value: boolean }>;
  /** Project and device side by side, for the deploy dialog (UX-019). */
  readonly facts: DeployFacts;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * What the outputs do whenever the program does not control them: off, unless the artifact carries another value
 * (RT-023). The values are read from the artifact that is about to be written, so the confirmation shows what the
 * device will apply and not what the project says now. An output is named by its address, which is how the board
 * description and the artifact name it.
 */
function declaredSafeOf(bytecode: Uint8Array): HardwareDeployConfirmation['declaredSafe'] {
  return readArtifact(bytecode).safe.map((entry) => ({ address: `%QX${entry.offset}.${entry.bit}`, value: entry.value === 1 }));
}

async function sha256Of(bytecode: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytecode.byteLength);
  digestInput.set(bytecode);
  return hex(await globalThis.crypto.subtle.digest('SHA-256', digestInput.buffer));
}

/**
 * The project and the device side by side, whatever they are: unlike the confirmation it never refuses, so that the
 * dialog can show a board that does not match, or one that said nothing, as the cause of a refused deploy (UX-019).
 */
export async function gatherDeployFacts({
  bytecode,
  projectBoard,
  projectName = null,
  systemInfo,
  taskCount,
  transfer = connectionManager.linkInfo.firmware?.protocol.kind === 'framed' ? 'framed' : 'text-shell',
}: {
  bytecode: Uint8Array;
  projectBoard: string | undefined;
  projectName?: string | null;
  systemInfo: unknown;
  taskCount: number;
  transfer?: 'framed' | 'text-shell';
}): Promise<DeployFacts> {
  const attempt = <T>(read: () => T, otherwise: T): T => {
    try {
      return read();
    } catch {
      return otherwise;
    }
  };
  const info = attempt(() => parseDeviceSystemInfo(systemInfo), null);
  const artifactAbi = attempt(() => {
    const abi = readArtifactAbi(bytecode);
    return { major: abi.major, minor: abi.minor, draft: abi.draftCounter };
  }, null);
  return {
    project: {
      name: projectName,
      board: BOARD_OPTIONS.find((board) => board.value === projectBoard)?.label ?? projectBoard ?? '',
      boardProfile: getZephyrBoardTarget(projectBoard) ?? null,
      abi: artifactAbi,
      sha256: await sha256Of(bytecode),
      byteLength: bytecode.byteLength,
      taskCount,
    },
    device:
      info === null
        ? null
        : {
            board: info.board,
            boardProfile: info.board_profile,
            zplcVersion: info.zplc_version,
            zephyrVersion: info.zephyr_version,
            abi: { major: info.bytecode_abi_major, minor: info.bytecode_abi_minor },
            draft: info.draft_counter ?? null,
            maxArtifactBytes: info.memory.max_artifact_size ?? null,
            maxTasks: info.capabilities.max_tasks,
          },
    declaredSafe: attempt(() => declaredSafeOf(bytecode), []),
    transfer,
  };
}

/** Preflight the exact program bytes before a human can approve a hardware deploy. */
export async function createHardwareDeployConfirmation({
  bytecode,
  projectBoard,
  projectName = null,
  systemInfo,
  taskCount,
  transfer = connectionManager.linkInfo.firmware?.protocol.kind === 'framed' ? 'framed' : 'text-shell',
}: {
  bytecode: Uint8Array;
  projectBoard: string | undefined;
  projectName?: string | null;
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
  const facts = await gatherDeployFacts({ bytecode, projectBoard, projectName, systemInfo, taskCount, transfer });
  return {
    projectBoard: option.label,
    deviceBoard: handshake.board,
    boardProfile: handshake.boardProfile,
    sha256: facts.project.sha256,
    byteLength: bytecode.byteLength,
    taskCount,
    deviceCapacityBytes: handshake.maxArtifactBytes,
    transfer,
    declaredSafe: facts.declaredSafe,
    facts,
  };
}
