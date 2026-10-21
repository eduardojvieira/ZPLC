/**
 * @file serialResponses.ts
 * @brief Strict readers of the JSON answers of the device shell (status and force list).
 *
 * They hold the checks a serial answer has to pass before the adapter uses it. They were the top of
 * serialAdapter.ts; they are a module of their own so that the adapter holds the commands and not the parsing.
 */

import type { WatchForceEntry } from './debugAdapter';
import { getForceRegionBounds, MEMORY_MAP, WATCH_FORCE_STATE } from './debugAdapter';
import type { StatusInfo } from './serialAdapter';

const ZPLC_STATUS_STATES = new Set(['idle', 'loading', 'ready', 'running', 'paused', 'error', 'uninit']);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isByte(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 0xff;
}

export function requireForceCommandConfirmation(response: string): void {
  if (!response.startsWith('OK:')) {
    throw new Error('Force command confirmation failed');
  }
}

export function parseStatusInfo(value: unknown): StatusInfo {
  if (
    !isRecord(value) ||
    typeof value.state !== 'string' ||
    !ZPLC_STATUS_STATES.has(value.state.toLowerCase()) ||
    !isNonNegativeInteger(value.uptime_ms) ||
    !isRecord(value.stats) ||
    !isNonNegativeInteger(value.stats.cycles) ||
    !Array.isArray(value.opi) ||
    !value.opi.every(isByte)
  ) {
    throw new Error('Invalid ZPLC status response');
  }

  for (const field of ['overruns', 'active_tasks', 'program_size'] as const) {
    if (value.stats[field] !== undefined && !isNonNegativeInteger(value.stats[field])) {
      throw new Error('Invalid ZPLC status response');
    }
  }

  if (
    value.io_unsupported !== undefined &&
    (!isRecord(value.io_unsupported) ||
      !isNonNegativeInteger(value.io_unsupported.inputs) ||
      !isNonNegativeInteger(value.io_unsupported.outputs))
  ) {
    throw new Error('Invalid ZPLC status response');
  }

  if (value.vm !== undefined) {
    if (
      !isRecord(value.vm) ||
      !isNonNegativeInteger(value.vm.pc) ||
      !isNonNegativeInteger(value.vm.sp) ||
      typeof value.vm.halted !== 'boolean' ||
      typeof value.vm.error !== 'number' ||
      !Number.isSafeInteger(value.vm.error)
    ) {
      throw new Error('Invalid ZPLC status response');
    }
  }

  return value as unknown as StatusInfo;
}

export function parseForcedValues(value: unknown): WatchForceEntry[] {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.count) ||
    value.count > 8 ||
    !Array.isArray(value.items) ||
    value.count !== value.items.length
  ) {
    throw new Error('Invalid force list response');
  }

  const ranges: Array<{ start: number; end: number }> = [];
  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      !isNonNegativeInteger(item.addr) ||
      item.addr > 0xffff ||
      !isNonNegativeInteger(item.size) ||
      item.size === 0 ||
      item.size > 260 ||
      typeof item.bytes !== 'string' ||
      !/^[0-9a-f]*$/i.test(item.bytes) ||
      item.bytes.length !== item.size * 2
    ) {
      throw new Error('Invalid force list response');
    }

    const address = item.addr as number;
    const size = item.size as number;
    const bytes = item.bytes as string;
    const end = address + size;
    const regionEnd = getForceRegionBounds(address).end;
    if (end > MEMORY_MAP.code.baseAddress || end > regionEnd || ranges.some((range) => address < range.end && range.start < end)) {
      throw new Error('Invalid force list response');
    }
    ranges.push({ start: address, end });

    return {
      path: `0x${address.toString(16).toUpperCase().padStart(4, '0')}`,
      address,
      size,
      type: size === 1 ? 'BYTE' : size === 2 ? 'WORD' : 'DWORD',
      bytesHex: bytes,
      state: WATCH_FORCE_STATE.FORCED,
    };
  });
}

const reportedUnsupportedIo = new WeakMap<object, string>();

/**
 * IO-007: an I/O operation the board cannot perform is skipped by the scan; the status says how many channels
 * (`io_unsupported`) and the console is told once for each change of the report, never while it is empty.
 */
export function noteUnsupportedIo(owner: object, status: StatusInfo, emit: ((line: string) => void) | undefined): StatusInfo {
  const report = (status as StatusInfo & { io_unsupported?: { inputs: number; outputs: number } }).io_unsupported;
  const inputs = report?.inputs ?? 0;
  const outputs = report?.outputs ?? 0;
  const key = inputs + outputs === 0 ? '' : `${inputs}/${outputs}`;
  if (key !== (reportedUnsupportedIo.get(owner) ?? '')) {
    reportedUnsupportedIo.set(owner, key);
    if (key !== '') emit?.(`WARN: I/O not supported by this board, skipped: ${inputs} input(s), ${outputs} output(s)\n`);
  }
  return status;
}
