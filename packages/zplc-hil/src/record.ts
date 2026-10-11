import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

import type { BuildIdentity } from './link';

/**
 * The run record (HIL-009). The schema is tools/hil/run-record.schema.json, the file tools/hil/hil_record.py reads
 * too, so that a record written by either tool is one both accept. Only the keywords the schema uses are checked, so
 * that nothing needs a validator library.
 */
/** The version of this harness, which a record carries. */
export const VERSION_OF_HARNESS = '1';

export const SCHEMA_URL = new URL('../../../tools/hil/run-record.schema.json', import.meta.url);

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Schema {
  type?: string | string[];
  const?: Json;
  enum?: Json[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
}

export function loadSchema(): Schema {
  return JSON.parse(readFileSync(SCHEMA_URL, 'utf8')) as Schema;
}

function is(value: unknown, name: string): boolean {
  switch (name) {
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return false;
  }
}

/** The ways `value` does not fit the schema; an empty list is a valid record. */
export function validate(value: unknown, schema: Schema = loadSchema(), path = '$'): string[] {
  if (schema.const !== undefined && value !== schema.const) return [`${path}: must be ${JSON.stringify(schema.const)}`];
  if (schema.enum && !schema.enum.includes(value as Json)) return [`${path}: must be one of ${JSON.stringify(schema.enum)}`];
  if (schema.type) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!names.some((name) => is(value, name))) return [`${path}: must be ${names.join(' or ')}`];
  }
  const errors: string[] = [];
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (value.length < (schema.minLength ?? 0)) errors.push(`${path}: must not be shorter than ${schema.minLength}`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be at least ${schema.minimum}`);
  if (is(value, 'object')) {
    const object = value as Record<string, unknown>;
    for (const name of schema.required ?? []) if (!(name in object)) errors.push(`${path}: ${name} is required`);
    for (const [name, item] of Object.entries(object)) {
      const property = schema.properties?.[name];
      if (property) errors.push(...validate(item, property, `${path}.${name}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: ${name} is not a field of the record`);
    }
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) errors.push(`${path}: must hold at least ${schema.minItems} items`);
    if (schema.items) value.forEach((item, position) => errors.push(...validate(item, schema.items, `${path}[${position}]`)));
  }
  return errors;
}

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** A name for one USB unit that does not publish its serial number. */
export function serialHash(vid: string | undefined, pid: string | undefined, serialNumber: string | undefined): string | null {
  if (serialNumber === undefined) return null;
  const hex = (value: string | undefined) => (value ?? '0').toLowerCase().padStart(4, '0');
  return sha256(`${hex(vid)}:${hex(pid)}:${serialNumber}`);
}

export interface RunStep {
  id: string; title: string; kind: 'automatic' | 'physical'; result: 'pass' | 'fail' | 'error' | 'skipped' | 'pending';
  requirement?: string; started_at?: string; ended_at?: string; confirmed_at?: string; confirmed_identity?: string; detail?: string;
  measurements?: Record<string, Json>;
}

export interface RunRecord {
  schema: 'zplc.hil.run-record/1'; run_id: string; kind: 'chain' | 'scenario' | 'script'; evidence: 'hardware' | 'host-runtime' | 'fake';
  result: 'pass' | 'fail' | 'incomplete'; started_at: string; ended_at: string;
  board: { id: string; zephyr_board?: string | null };
  device: { reported_board: string; board_profile?: string | null; zplc_version?: string | null; zephyr_version?: string | null; serial_hash?: string | null; link?: 'serial' | 'host-runtime' | 'fake' };
  firmware: {
    commit?: string | null; version?: string | null; image_sha256?: string | null; abi_major?: number | null; abi_minor?: number | null; draft_counter?: number | null;
    dirty?: boolean | null; board_target?: string | null; options_hash?: string | null; options?: string | null; build_options?: Record<string, string> | null;
    hil_trace?: boolean | null; build_command?: string | null;
  };
  programs?: Array<{ id: string; sha256: string }>;
  scenario?: { id: string; sha256: string; tolerance_ms?: number };
  repository?: { commit?: string | null; dirty?: boolean | null };
  tools: { harness: string; platform: string; python?: string | null; bun?: string | null; compiler_draft_counter?: number | null };
  operator: { name: string };
  steps: RunStep[];
  tests: Array<{ id: string; title?: string; result: 'pass' | 'fail' | 'skipped'; detail?: string }>;
  measurements?: Record<string, Json>;
  logs: Array<{ name: string; text: string }>;
}

/** `A=y,B=8192` as { A: 'y', B: '8192' }; `none` as {}. */
export function parseOptions(options: string): Record<string, string> {
  if (options === 'none') return {};
  const found: Record<string, string> = {};
  for (const item of options.split(',')) {
    if (item === '') continue;
    const at = item.indexOf('=');
    found[at < 0 ? item : item.slice(0, at)] = at < 0 ? '' : item.slice(at + 1);
  }
  return found;
}

/**
 * The firmware fields of a record from the identity of `zplc sys build --json` (REL-023); {} for an image that reports
 * none. `hil_trace` is read from the options of a Zephyr image, which lists every CONFIG_ZPLC_* symbol that is on, so
 * the absence of HIL_DEBUG there is off. A host build lists no such symbols, and then the record does not say.
 */
export function firmwareIdentity(build: BuildIdentity | undefined): RunRecord['firmware'] {
  if (build === undefined) return {};
  const options = parseOptions(build.options);
  return {
    commit: build.commit === 'unknown' ? null : build.commit,
    version: build.version,
    dirty: build.dirty,
    board_target: build.board,
    abi_major: build.abiMajor,
    abi_minor: build.abiMinor,
    draft_counter: build.draftCounter,
    options_hash: build.optionsHash,
    options: build.options,
    build_options: options,
    hil_trace: Object.values(options).includes('y') ? options.HIL_DEBUG === 'y' : null,
  };
}

/** pass when something ran and nothing failed, fail on any failure, incomplete when nothing ran. A pending step was not run. */
export function summarize(record: Pick<RunRecord, 'steps' | 'tests'>): RunRecord['result'] {
  if (record.steps.some((step) => step.result === 'fail' || step.result === 'error') || record.tests.some((test) => test.result === 'fail')) return 'fail';
  return record.steps.some((step) => step.result === 'pass') ? 'pass' : 'incomplete';
}
