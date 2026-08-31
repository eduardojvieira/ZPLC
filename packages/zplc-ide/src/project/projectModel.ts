import type { ZPLCProjectV2 } from '../types';
import { findNonEmptySensitiveProjectConfigPaths } from '../utils/projectExport';

export interface ProjectModelDiagnostic {
  path: string;
  message: string;
}

export interface ProjectMigrationChange {
  op: 'add' | 'remove' | 'replace';
  path: string;
}

/** Matches the highest Zephyr scheduler capacity across supported profiles. */
export const PROJECT_MAX_TASKS = 16;
export const PROJECT_MAX_INCOMPATIBLE_OUTPUTS = 64;
const PROJECT_SIGNAL = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

export type ProjectModelResult =
  | { ok: true; project: ZPLCProjectV2; sourceSchemaVersion: 1 | 2; changed: boolean; changes: ProjectMigrationChange[] }
  | { ok: false; diagnostics: ProjectModelDiagnostic[] };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

function invalid(path: string, message: string): ProjectModelResult {
  return { ok: false, diagnostics: [{ path, message }] };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPriority(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

function validateSafety(value: unknown): ProjectModelResult | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'incompatibleOutputs')) return invalid('safety', 'Safety declaration is invalid');
  const pairs = value.incompatibleOutputs;
  if (!Array.isArray(pairs) || pairs.length === 0 || pairs.length > PROJECT_MAX_INCOMPATIBLE_OUTPUTS) return invalid('safety.incompatibleOutputs', 'Safety incompatible output pairs are invalid');
  const seen = new Set<string>();
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((signal) => typeof signal === 'string' && signal.length <= 128 && PROJECT_SIGNAL.test(signal))) return invalid(`safety.incompatibleOutputs[${index}]`, 'Safety incompatible output pair is invalid');
    const [left, right] = pair as [string, string];
    if (left === right) return invalid(`safety.incompatibleOutputs[${index}]`, 'Safety incompatible output pair must contain distinct outputs');
    const key = [left, right].sort().join('\u0000');
    if (seen.has(key)) return invalid(`safety.incompatibleOutputs[${index}]`, 'Safety incompatible output pair is duplicated');
    seen.add(key);
  }
  return undefined;
}

function findCredentialNamedPaths(value: unknown, path = '', seen = new WeakSet<object>()): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (seen.has(value)) return [path];
  seen.add(value);
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    const isCredential = /(?:password|passwd|secret|secretkey|token|apikey|accesskey|privatekey(?:path)?|saskey|credential(?:s)?|bearer|psk)$/.test(normalized);
    if (isCredential && child !== undefined && child !== null && (typeof child !== 'string' || child.trim().length > 0)) {
      paths.push(childPath);
    }
    paths.push(...findCredentialNamedPaths(child, childPath, seen));
  }
  return paths;
}

/** Parses external project JSON into the canonical, in-memory v2 representation. */
export function parseAndMigrateProject(value: unknown): ProjectModelResult {
  if (!isObject(value)) return invalid('$', 'Project configuration must be an object');

  let project: JsonObject;
  try {
    project = structuredClone(value);
  } catch {
    return invalid('$', 'Project configuration is not cloneable');
  }

  const sensitivePaths = [...new Set([...findNonEmptySensitiveProjectConfigPaths(project), ...findCredentialNamedPaths(project)])];
  if (sensitivePaths.length > 0) {
    return { ok: false, diagnostics: sensitivePaths.map((path) => ({ path, message: 'Sensitive project values are not supported' })) };
  }

  const rawVersion = project.schemaVersion;
  if (rawVersion !== undefined && rawVersion !== 1 && rawVersion !== 2) return invalid('schemaVersion', 'Unsupported project schema version');
  const sourceSchemaVersion: 1 | 2 = rawVersion === 2 ? 2 : 1;
  const changes: ProjectMigrationChange[] = [];
  const changedPaths = new Set<string>();
  const change = (op: ProjectMigrationChange['op'], path: string): void => {
    const key = `${path}\u0000${op}`;
    if (!changedPaths.has(key)) {
      changedPaths.add(key);
      changes.push({ op, path });
    }
  };
  if (project.schemaVersion !== 2) {
    change(rawVersion === undefined ? 'add' : 'replace', '/schemaVersion');
    project.schemaVersion = 2;
  }

  if (!isNonEmptyString(project.name)) return invalid('name', 'Project name must not be empty');
  if (!isNonEmptyString(project.version) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(project.version)) {
    return invalid('version', 'Project version must be semver');
  }
  const safetyFailure = validateSafety(project.safety);
  if (safetyFailure) return safetyFailure;
  if (!Array.isArray(project.tasks) || project.tasks.length === 0) return invalid('tasks', 'Project must define at least one task');
  if (project.tasks.length > PROJECT_MAX_TASKS) return invalid('tasks', 'Project exceeds the maximum supported task count');

  if (isObject(project.communication) && Object.hasOwn(project.communication, 'tags')) {
    const communication = project.communication;
    if (Object.hasOwn(communication, 'bindings') && !sameJson(communication.bindings, communication.tags)) {
      return invalid('communication.tags', 'Legacy tags conflict with bindings');
    }
    if (!Object.hasOwn(communication, 'bindings')) {
      change('add', '/communication/bindings');
      communication.bindings = communication.tags;
    }
    change('remove', '/communication/tags');
    delete communication.tags;
  }

  for (let index = 0; index < project.tasks.length; index += 1) {
    const task = project.tasks[index];
    const path = `tasks[${index}]`;
    if (!isObject(task)) return invalid(path, 'Task must be an object');
    if (!isNonEmptyString(task.name)) return invalid(`${path}.name`, 'Task name must not be empty');

    const hasInterval = Object.hasOwn(task, 'interval');
    if (task.interval_ms === undefined) {
      change('add', `/tasks/${index}/interval_ms`);
      task.interval_ms = hasInterval ? task.interval : 10;
    } else if (hasInterval && task.interval !== task.interval_ms) {
      return invalid(`${path}.interval`, 'Legacy interval conflicts with interval_ms');
    }
    if (hasInterval) {
      change('remove', `/tasks/${index}/interval`);
      delete task.interval;
    }
    const hasType = Object.hasOwn(task, 'type');
    if (task.trigger === undefined) {
      change('add', `/tasks/${index}/trigger`);
      task.trigger = hasType && typeof task.type === 'string' ? task.type.toLowerCase() : hasType ? task.type : 'cyclic';
    } else if (hasType && (typeof task.type !== 'string' || typeof task.trigger !== 'string' || task.type.toLowerCase() !== task.trigger.toLowerCase())) {
      return invalid(`${path}.type`, 'Legacy type conflicts with trigger');
    }
    if (hasType) {
      change('remove', `/tasks/${index}/type`);
      delete task.type;
    }
    const hasFile = Object.hasOwn(task, 'file');
    if (task.programs === undefined && hasFile) {
      change('add', `/tasks/${index}/programs`);
      task.programs = typeof task.file === 'string' ? [task.file] : task.file;
    } else if (hasFile && (!Array.isArray(task.programs) || task.programs.length !== 1 || task.programs[0] !== task.file)) {
      return invalid(`${path}.file`, 'Legacy file conflicts with programs');
    }
    if (hasFile) {
      change('remove', `/tasks/${index}/file`);
      delete task.file;
    }
    if (task.priority === undefined) {
      change('add', `/tasks/${index}/priority`);
      task.priority = 1;
    }
    const hasWatchdog = Object.hasOwn(task, 'watchdog');
    if (task.watchdog_ms === undefined && hasWatchdog) {
      change('add', `/tasks/${index}/watchdog_ms`);
      task.watchdog_ms = task.watchdog;
    } else if (hasWatchdog && task.watchdog !== task.watchdog_ms) {
      return invalid(`${path}.watchdog`, 'Legacy watchdog conflicts with watchdog_ms');
    }
    if (hasWatchdog) {
      change('remove', `/tasks/${index}/watchdog`);
      delete task.watchdog;
    }

    if (!Array.isArray(task.programs) || task.programs.length === 0 || !task.programs.every(isNonEmptyString)) return invalid(`${path}.programs`, 'Task programs must be a non-empty string array');
    if (task.trigger !== 'cyclic' && task.trigger !== 'event' && task.trigger !== 'freewheeling') return invalid(`${path}.trigger`, 'Task trigger is invalid');
    if (!isPositiveInteger(task.interval_ms)) return invalid(`${path}.interval_ms`, 'Task interval must be a positive integer');
    if (!isPriority(task.priority)) return invalid(`${path}.priority`, 'Task priority must be an integer from 0 to 255');
    if (task.watchdog_ms !== undefined && (!Number.isInteger(task.watchdog_ms) || typeof task.watchdog_ms !== 'number' || task.watchdog_ms < 0)) return invalid(`${path}.watchdog_ms`, 'Task watchdog must be a non-negative integer');
  }

  changes.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.op < right.op ? -1 : left.op > right.op ? 1 : 0);
  return { ok: true, project: project as unknown as ZPLCProjectV2, sourceSchemaVersion, changed: changes.length > 0, changes };
}
