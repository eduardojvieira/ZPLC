import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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
  firmware: { commit?: string | null; version?: string | null; image_sha256?: string | null; abi_major?: number | null; abi_minor?: number | null; draft_counter?: number | null; build_options?: Record<string, Json> | null };
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

/** The firmware fields of a record from the JSON of `zplc sys info`; what the image does not report stays null. */
export function firmwareIdentity(info: Record<string, unknown>): RunRecord['firmware'] {
  const build = typeof info.build === 'object' && info.build !== null ? (info.build as Record<string, unknown>) : {};
  const pool = { ...info, ...build };
  // the names a firmware image may report its build under: REL-023 will fix them, and this is the one place that learns them
  const text = (keys: string[]): string | null => {
    for (const key of keys) if (typeof pool[key] === 'string' && pool[key]) return pool[key] as string;
    return null;
  };
  const integer = (key: string): number | null => (Number.isInteger(info[key]) ? (info[key] as number) : null);
  const options = build.options ?? info.build_options;
  return {
    commit: text(['commit', 'git_commit', 'build_commit', 'zplc_commit']),
    version: text(['zplc_version', 'version', 'build_version']),
    abi_major: integer('bytecode_abi_major'),
    abi_minor: integer('bytecode_abi_minor'),
    draft_counter: integer('draft_counter'),
    build_options: typeof options === 'object' && options !== null ? (options as Record<string, Json>) : null,
  };
}

/** pass when something ran and nothing failed, fail on any failure, incomplete when nothing ran. A pending step was not run. */
export function summarize(record: Pick<RunRecord, 'steps' | 'tests'>): RunRecord['result'] {
  if (record.steps.some((step) => step.result === 'fail' || step.result === 'error') || record.tests.some((test) => test.result === 'fail')) return 'fail';
  return record.steps.some((step) => step.result === 'pass') ? 'pass' : 'incomplete';
}
