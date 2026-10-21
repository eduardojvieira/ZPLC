// The evidence a Tool API operation returns and the envelope that records who ran it (IDE-014: split out of toolApi.ts).
import { createHash, randomUUID } from 'node:crypto';
import type { ToolDiagnostic } from './workspace';

export type ToolOperation =
  | 'cli'
  | 'inspect'
  | 'migrate-preview'
  | 'migrate'
  | 'validate'
  | 'check'
  | 'compile'
  | 'symbols-list'
  | 'safety-check'
  | 'test'
  | 'scenario-run'
  | 'change-set-review'
  | 'boards-list'
  | 'toolchain-inspect'
  | 'firmware-build-plan'
  | 'firmware-build';
export const TOOL_OPERATIONS: readonly ToolOperation[] = [
  'cli',
  'inspect',
  'migrate-preview',
  'migrate',
  'validate',
  'check',
  'compile',
  'symbols-list',
  'safety-check',
  'test',
  'scenario-run',
  'change-set-review',
  'boards-list',
  'toolchain-inspect',
  'firmware-build-plan',
  'firmware-build',
];
export interface ToolArtifact {
  kind: 'zplc' | 'bytecode' | 'trace' | 'firmware-elf' | 'project-manifest';
  sha256: string;
  byteLength: number;
}
export interface ToolEvidence {
  schemaVersion: 1;
  operation: ToolOperation;
  outcome: 'passed' | 'failed';
  diagnostics: ToolDiagnostic[];
  artifacts: ToolArtifact[];
}
export const TOOL_EXECUTION_ACTORS = ['human-studio', 'cli', 'mcp', 'agent'] as const;
export const TOOL_EXECUTION_PERMISSIONS = [
  'project:read',
  'project:migrate',
  'compiler:check',
  'safety:check',
  'tests:run',
  'toolchain:inspect',
  'firmware:build',
] as const;
export type ToolExecutionActor = (typeof TOOL_EXECUTION_ACTORS)[number];
export type ToolExecutionPermission = (typeof TOOL_EXECUTION_PERMISSIONS)[number];
export type ToolExecutionOutcome = 'passed' | 'failed' | 'cancelled';
/** Metadata-only execution record. ToolEvidence remains stable and continues to describe the tool result itself. */
export interface ToolExecutionEnvelope {
  schemaVersion: 1;
  jobId: string;
  actor: ToolExecutionActor;
  permission: ToolExecutionPermission;
  operation: ToolOperation;
  outcome: ToolExecutionOutcome;
  startedAt: string;
  finishedAt: string;
}
export interface ToolExecutionStart {
  jobId: string;
  actor: ToolExecutionActor;
  permission: ToolExecutionPermission;
  operation: ToolOperation;
  startedAt: string;
}
const EXECUTION_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCELLED_DIAGNOSTIC_CODES = new Set(['TEST_CANCELLED', 'FIRMWARE_BUILD_CANCELLED', 'TOOL_CANCELLED']);
export function executionPermission(operation: ToolOperation): ToolExecutionPermission {
  switch (operation) {
    case 'inspect':
    case 'migrate-preview':
    case 'validate':
      return 'project:read';
    case 'migrate':
      return 'project:migrate';
    case 'safety-check':
      return 'safety:check';
    case 'test':
    case 'scenario-run':
    case 'change-set-review':
      return 'tests:run';
    case 'boards-list':
    case 'toolchain-inspect':
      return 'toolchain:inspect';
    case 'firmware-build':
    case 'firmware-build-plan':
      return 'firmware:build';
    default:
      return 'compiler:check';
  }
}
export function startToolExecution(
  actor: ToolExecutionActor,
  permission: ToolExecutionPermission,
  operation: ToolOperation,
  now = new Date(),
): ToolExecutionStart {
  return { jobId: randomUUID(), actor, permission, operation, startedAt: now.toISOString() };
}
function dateValue(value: string): number | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : undefined;
}
function executionOutcome(value: unknown): ToolExecutionOutcome {
  const own = (record: unknown, key: string): unknown => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  };
  const evidence = own(value, 'evidence');
  const diagnostics = own(evidence, 'diagnostics');
  if (
    Array.isArray(diagnostics) &&
    diagnostics.every((diagnostic) => diagnostic && typeof diagnostic === 'object') &&
    diagnostics.some((diagnostic) => CANCELLED_DIAGNOSTIC_CODES.has(own(diagnostic, 'code') as string))
  )
    return 'cancelled';
  return own(evidence, 'outcome') === 'passed' ? 'passed' : 'failed';
}
export function finishToolExecution(start: ToolExecutionStart, value: unknown, now = new Date()): ToolExecutionEnvelope {
  const started = dateValue(start.startedAt);
  const finishedAt = now.getTime() < (started ?? now.getTime()) ? start.startedAt : now.toISOString();
  return { schemaVersion: 1, ...start, outcome: executionOutcome(value), finishedAt };
}
export function isToolExecutionEnvelope(value: unknown): value is ToolExecutionEnvelope {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    return false;
  const record = value as Record<string, unknown>;
  const keys = Object.getOwnPropertyNames(record);
  if (
    keys.length !== 8 ||
    !['schemaVersion', 'jobId', 'actor', 'permission', 'operation', 'outcome', 'startedAt', 'finishedAt'].every((key) => keys.includes(key))
  )
    return false;
  if (
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return !descriptor || !descriptor.enumerable || !('value' in descriptor);
    })
  )
    return false;
  const started = dateValue(record.startedAt as string);
  const finished = dateValue(record.finishedAt as string);
  return (
    record.schemaVersion === 1 &&
    typeof record.jobId === 'string' &&
    EXECUTION_JOB_ID.test(record.jobId) &&
    typeof record.actor === 'string' &&
    (TOOL_EXECUTION_ACTORS as readonly string[]).includes(record.actor) &&
    typeof record.operation === 'string' &&
    TOOL_OPERATIONS.includes(record.operation as ToolOperation) &&
    typeof record.permission === 'string' &&
    record.permission === executionPermission(record.operation as ToolOperation) &&
    typeof record.outcome === 'string' &&
    ['passed', 'failed', 'cancelled'].includes(record.outcome) &&
    started !== undefined &&
    finished !== undefined &&
    finished >= started
  );
}
export function withToolExecution<T extends object>(value: T, execution: ToolExecutionEnvelope): T & { execution: ToolExecutionEnvelope } {
  return { ...value, execution };
}
export type ToolResult<T> = { ok: true; summary: T; evidence: ToolEvidence } | { ok: false; evidence: ToolEvidence };

export function artifactEvidence(kind: ToolArtifact['kind'], bytes: Uint8Array): ToolArtifact {
  return { kind, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength };
}
export function evidence(
  operation: ToolOperation,
  outcome: 'passed' | 'failed',
  diagnostics: ToolDiagnostic[] = [],
  artifacts: ToolEvidence['artifacts'] = [],
): ToolEvidence {
  return { schemaVersion: 1, operation, outcome, diagnostics, artifacts };
}
export function failed<T>(operation: ToolOperation, diagnostics: ToolDiagnostic[], artifacts: ToolArtifact[] = []): ToolResult<T> {
  return { ok: false, evidence: evidence(operation, 'failed', diagnostics, artifacts) };
}
