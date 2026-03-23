export const NATIVE_MESSAGE_TYPE = {
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
} as const;

export type NativeMessageType = (typeof NATIVE_MESSAGE_TYPE)[keyof typeof NATIVE_MESSAGE_TYPE];

export const NATIVE_CAPABILITY_STATUS = {
  SUPPORTED: 'supported',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
} as const;

export type NativeCapabilityStatus =
  (typeof NATIVE_CAPABILITY_STATUS)[keyof typeof NATIVE_CAPABILITY_STATUS];

export interface NativeCapabilityEntry {
  name: string;
  status: NativeCapabilityStatus;
  reason?: string;
  recommended_action?: string;
}

export interface NativeCapabilityProfile {
  profile_id: string;
  features: NativeCapabilityEntry[];
}

export interface NativeRuntimeStats {
  cycles: number;
  active_tasks: number;
  overruns: number;
  program_size: number;
}

export interface NativeFocusedVm {
  pc: number;
  sp: number;
  halted: boolean;
  error: number;
}

export interface NativeTaskSnapshot {
  task_id: number;
  state: string;
  cycles: number;
  overruns: number;
  interval_us: number;
  priority: number;
  pc: number;
  sp: number;
  halted: boolean;
  error: number;
}

export interface NativeForceEntry {
  address: number;
  size: number;
  bytes_hex: string;
  state: string;
}

export interface NativeParityMismatch {
  feature: string;
  native_observation: string;
  hardware_observation: string;
  severity: 'blocking' | 'degrading' | 'informational';
  resolution: 'fix' | 'downgrade-claim' | 'accepted-difference';
}

export interface NativeParityEvidenceRecord {
  evidence_id: string;
  reference_project_id: string;
  capability_scope: string[];
  native_result: 'pass' | 'fail' | 'degraded';
  hardware_result: 'pass' | 'fail';
  mismatches: NativeParityMismatch[];
  owner: string;
  recorded_at: string;
}

export interface NativeRuntimeSnapshot {
  state: string;
  uptime_ms: number;
  stats: NativeRuntimeStats;
  focused_vm: NativeFocusedVm;
  tasks: NativeTaskSnapshot[];
  opi: number[];
  force_entries: NativeForceEntry[];
}

export interface NativeHelloResult {
  protocol_version: string;
  runtime_kind: string;
  runtime_version: string;
  capability_profile: NativeCapabilityProfile;
}

export interface NativeErrorDetails {
  feature?: string;
  recommended_action?: string;
}

export interface NativeErrorPayload {
  code: string;
  message: string;
  details?: NativeErrorDetails;
}

export interface NativeRequestMessage<TParams = Record<string, unknown>> {
  id: string;
  type: typeof NATIVE_MESSAGE_TYPE.REQUEST;
  method: string;
  params: TParams;
}

export interface NativeResponseMessage<TResult = unknown> {
  id: string;
  type: typeof NATIVE_MESSAGE_TYPE.RESPONSE;
  result?: TResult;
  error?: NativeErrorPayload;
}

export interface NativeEventMessage<TParams = Record<string, unknown>> {
  type: typeof NATIVE_MESSAGE_TYPE.EVENT;
  method: string;
  params: TParams;
}

export function createNativeRequest<TParams extends Record<string, unknown>>(
  id: string,
  method: string,
  params: TParams,
): NativeRequestMessage<TParams> {
  return {
    id,
    type: NATIVE_MESSAGE_TYPE.REQUEST,
    method,
    params,
  };
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().replace(/\s+/g, '').toUpperCase();
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  if (normalized.length % 2 !== 0) {
    throw new Error('Hex payload must have an even number of characters');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    const byte = Number.parseInt(normalized.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex byte at offset ${index}`);
    }
    bytes[index / 2] = byte;
  }
  return bytes;
}
