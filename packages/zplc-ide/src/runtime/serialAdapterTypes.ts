/**
 * The shapes of the replies of the serial runtime and the timing constants of the serial link (IDE-014: split out of
 * serialAdapter.ts).
 */

import type { VMInfo } from './debugAdapter';
import type { DeviceSystemInfo } from './deviceHandshake';

/** Command timeout in milliseconds.
 * 10 s to accommodate firmware flash writes (NVS page erase can take ~1 s
 * on ESP32-S3; the firmware fix removes per-setter flushes, but we keep this
 * generous so older firmware images do not regress). */
export const COMMAND_TIMEOUT_MS = 10000;

/** Line ending for commands */
export const LINE_ENDING = '\r\n';

/**
 * Extended VMInfo with additional fields from JSON responses
 */
export interface ExtendedVMInfo extends VMInfo {
  state: string;
  uptime_ms: number;
  opi: number[];
  ipi?: number[];
  active_tasks?: number;
  overruns?: number;
}

/**
 * System information from device
 */
export type SystemInfo = DeviceSystemInfo;

/**
 * Status information from device
 */
export interface StatusInfo {
  state: string;
  uptime_ms: number;
  stats: {
    cycles: number;
    overruns?: number;
    active_tasks?: number;
    program_size?: number;
  };
  tasks?: Array<{
    slot: number;
    id: number;
    prio: number;
    interval_us: number;
    cycles: number;
    overruns: number;
  }>;
  memory?: {
    work_total: number;
    retain_total: number;
  };
  vm?: {
    pc: number;
    sp: number;
    halted: boolean;
    error: number;
  };
  opi: number[];
}

export interface CommunicationMapEntry {
  index: number;
  kind: string;
  type: string;
  var_addr: number;
  width: number;
  value: number;
  effective_value: number;
  override: boolean;
}

export interface MqttRuntimeStatus {
  connected: boolean;
  subscribed: boolean;
  session_present: boolean;
  profile: number;
  protocol: number;
  transport: number;
  publish_qos: number;
  subscribe_qos: number;
  retain_enabled: boolean;
  lwt_enabled: boolean;
  last_error: number;
  last_publish_ms: number;
  reconnect_backoff_s: number;
  broker: string;
  client_id: string;
}

export interface CommunicationMapResponse {
  count: number;
  entries: CommunicationMapEntry[];
}
