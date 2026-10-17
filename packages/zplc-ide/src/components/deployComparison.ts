/**
 * The comparison that the deploy dialog shows (UX-019): the project on one side, the device on the other, a verdict for
 * every row and one plain sentence for every mismatch. Pure: the facts come from `gatherDeployFacts`, the words from the
 * translator, and nothing here talks to a device. A value the device does not report is shown as such, never guessed.
 */
import type { Translator } from '../i18n';
import { draftMismatchMessage } from '../runtime/draftCounter';

export interface DeployFacts {
  project: {
    name: string | null;
    /** The label of the board the project targets. */
    board: string;
    /** The board profile the project builds for. */
    boardProfile: string | null;
    /** The version the artifact was built for; null when the bytes are not an artifact. */
    abi: { major: number; minor: number; draft: number } | null;
    sha256: string;
    byteLength: number;
    taskCount: number;
  };
  /** What the device said in its system information; null when it said nothing valid. */
  device: {
    board: string;
    boardProfile: string;
    zplcVersion: string;
    zephyrVersion: string;
    abi: { major: number; minor: number };
    draft: number | null;
    maxArtifactBytes: number | null;
    maxTasks: number | null;
  } | null;
  declaredSafe: ReadonlyArray<{ address: string; value: boolean }>;
  transfer: 'framed' | 'text-shell';
}

export type DeployRowId = 'board' | 'profile' | 'firmware' | 'abi' | 'identity' | 'size' | 'tasks';
export type DeployRowStatus = 'match' | 'mismatch' | 'unreported' | 'info';

export interface DeployRow {
  id: DeployRowId;
  label: string;
  project: string;
  device: string;
  status: DeployRowStatus;
  /** What is wrong and what to do, for a mismatch. */
  message: string | null;
}

export interface DeployComparison {
  rows: DeployRow[];
  /** A mismatch: the deploy cannot go ahead, and the dialog offers Close only. */
  blocked: boolean;
  /** Sentences about the whole comparison that belong to no row. */
  notes: string[];
  safeState: string;
  scope: string;
  transfer: string;
}

const HASH_SHOWN = 12;

export function compareDeployFacts(facts: DeployFacts, t: Translator['t']): DeployComparison {
  const { project, device } = facts;
  const notReported = t('deploy.value.notReported');
  const abiText = (major: number, minor: number, draft: number | null): string =>
    draft === null ? t('deploy.value.abiNoDraft', { major, minor }) : t('deploy.value.abi', { major, minor, draft });
  const projectAbi = project.abi ? abiText(project.abi.major, project.abi.minor, project.abi.draft) : notReported;

  const profileMatches = device !== null && device.boardProfile === project.boardProfile;
  const abiMatches = device !== null && project.abi !== null
    && device.abi.major === project.abi.major && device.abi.minor === project.abi.minor && device.draft === project.abi.draft;
  const sizeStatus: DeployRowStatus = device?.maxArtifactBytes == null ? 'unreported' : project.byteLength > device.maxArtifactBytes ? 'mismatch' : 'match';
  const tasksStatus: DeployRowStatus = device?.maxTasks == null ? 'unreported' : project.taskCount > device.maxTasks ? 'mismatch' : 'match';

  const rows: DeployRow[] = [
    {
      id: 'board', label: t('deploy.row.board'), project: project.board, device: device?.board ?? notReported,
      status: device === null ? 'unreported' : profileMatches ? 'match' : 'mismatch', message: null,
    },
    {
      id: 'profile', label: t('deploy.row.profile'), project: project.boardProfile ?? notReported, device: device?.boardProfile ?? notReported,
      status: device === null ? 'unreported' : profileMatches ? 'match' : 'mismatch',
      message: device !== null && !profileMatches ? t('deploy.mismatch.profile', { project: project.boardProfile ?? project.board, device: device.boardProfile }) : null,
    },
    {
      id: 'firmware', label: t('deploy.row.firmware'), project: t('deploy.value.anyFirmware'),
      device: device ? t('deploy.value.firmware', { version: device.zplcVersion, zephyr: device.zephyrVersion }) : notReported,
      status: device === null ? 'unreported' : 'info', message: null,
    },
    {
      id: 'abi', label: t('deploy.row.abi'), project: projectAbi,
      device: device ? abiText(device.abi.major, device.abi.minor, device.draft) : notReported,
      status: device === null ? 'unreported' : abiMatches ? 'match' : 'mismatch',
      message: device !== null && !abiMatches
        ? (project.abi !== null && device.draft !== project.abi.draft
          ? draftMismatchMessage(project.abi.draft, device.draft)
          : t('deploy.mismatch.abi', { project: projectAbi, device: abiText(device.abi.major, device.abi.minor, device.draft) }))
        : null,
    },
    {
      id: 'identity', label: t('deploy.row.identity'),
      project: t('deploy.value.identity', { name: project.name ?? '', hash: project.sha256.slice(0, HASH_SHOWN) }).replace(/^, /, ''),
      // The device protocol has no command that reports the identity of the program it holds.
      device: notReported, status: 'unreported', message: null,
    },
    {
      id: 'size', label: t('deploy.row.size'), project: t('deploy.value.bytes', { count: project.byteLength }),
      device: device?.maxArtifactBytes == null ? notReported : t('deploy.value.upToBytes', { count: device.maxArtifactBytes }),
      status: sizeStatus,
      message: sizeStatus === 'mismatch' && device?.maxArtifactBytes != null ? t('deploy.mismatch.size', { size: project.byteLength, max: device.maxArtifactBytes }) : null,
    },
    {
      id: 'tasks', label: t('deploy.row.tasks'), project: t('deploy.value.count', { count: project.taskCount }),
      device: device?.maxTasks == null ? notReported : t('deploy.value.upTo', { count: device.maxTasks }),
      status: tasksStatus,
      message: tasksStatus === 'mismatch' && device?.maxTasks != null ? t('deploy.mismatch.tasks', { count: project.taskCount, max: device.maxTasks }) : null,
    },
  ];

  const values = facts.declaredSafe.map((output) => `${output.address}: ${output.value ? t('deploy.safe.on') : t('deploy.safe.off')}`).join(', ');
  return {
    rows,
    blocked: device === null || rows.some((entry) => entry.status === 'mismatch'),
    notes: device === null ? [t('deploy.mismatch.noDevice')] : [],
    safeState: facts.declaredSafe.length === 0 ? t('deploy.safe.none') : t('deploy.safe.declared', { values }),
    scope: t('deploy.safe.scope'),
    transfer: facts.transfer === 'framed' ? t('deploy.transfer.framed') : t('deploy.transfer.shell'),
  };
}
