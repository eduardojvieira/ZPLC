/**
 * The shapes of what the MCP server answers (moved out of server.ts unchanged, IDE-014): the public Tool API summaries, the
 * evidence and execution records, the recorded traces and the repository tool results. server.ts parses every result with them
 * before it answers, so nothing private crosses the boundary.
 */
import * as z from 'zod/v4';

export function logicalPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 512 ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value)
  )
    return false;
  return value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}
export const shortText = z.string().min(1).max(256);
export const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);

export const logicalPathSchema = z.string().max(512).refine(logicalPath);
/**
 * The element of a visual or IL source a diagnostic is about (LNG-003): `rung:r1/cell:0,2`, `block:and_1`, `line:12`; ids are
 * percent-encoded.
 */
export const elementSchema = z
  .string()
  .max(256)
  .regex(/^[a-z]+:[A-Za-z0-9_%.,!~*'()-]+(\/[a-z]+:[A-Za-z0-9_%.,!~*'()-]+)?$/);
export const diagnosticSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(96)
      .regex(/^[A-Z0-9_:-]+$/),
    message: z.string().min(1).max(512),
    path: logicalPathSchema.optional(),
    phase: z.enum(['lexer', 'parser', 'codegen', 'assembler']).optional(),
    line: z.number().int().optional(),
    column: z.number().int().optional(),
    endLine: z.number().int().optional(),
    endColumn: z.number().int().optional(),
    element: elementSchema.optional(),
    /** AIX-013: the place in a JSON file, the file when `path` names another, what was found, the accepted values, the reason. */
    jsonPath: z.string().max(256).optional(),
    file: z.string().max(256).optional(),
    found: z.string().max(256).optional(),
    acceptedValues: z.array(z.string().max(64)).max(400).optional(),
    detail: z.string().max(512).optional(),
  })
  .strict();
export const artifactSchema = z
  .object({
    kind: z.enum(['zplc', 'bytecode', 'trace', 'firmware-elf', 'project-manifest']),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const evidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    operation: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z-]*$/),
    outcome: z.enum(['passed', 'failed']),
    diagnostics: z.array(diagnosticSchema).max(256),
    artifacts: z.array(artifactSchema).max(8),
  })
  .strict();
export const executionSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string().uuid(),
    actor: z.literal('mcp'),
    permission: z.enum(['project:read', 'compiler:check', 'safety:check', 'tests:run', 'toolchain:inspect', 'firmware:build']),
    operation: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z-]*$/),
    outcome: z.enum(['passed', 'failed', 'cancelled']),
    startedAt: z.string().datetime({ offset: false }),
    finishedAt: z.string().datetime({ offset: false }),
  })
  .strict();
export const compilerSummarySchema = z
  .object({
    name: shortText,
    version: z.string().min(1).max(64),
    taskCount: z.number().int().nonnegative(),
    codeSize: z.number().int().nonnegative(),
    draftCounter: z.number().int().nonnegative().optional(),
  })
  .strict();
export const testSummarySchema = z
  .object({
    backend: z.literal('native-posix'),
    mode: z.literal('logical-cyclic-task-set-scan'),
    scenarios: z
      .array(
        z
          .object({
            id: identifier,
            path: logicalPathSchema.refine((path) => path.startsWith('tests/')),
            passed: z.boolean(),
            traceSha256: z.string().regex(/^[0-9a-f]{64}$/),
            traceByteLength: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const savedInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    fileCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export const boardSummarySchema = z
  .object({
    boardId: z
      .string()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    ideId: z
      .string()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_]*$/),
    zephyrBoard: z
      .string()
      .max(128)
      .regex(/^[a-z0-9][a-z0-9_/-]*$/),
    validationLevel: z.enum(['cross-build', 'human-hil']),
  })
  .strict();
export const boardsResultSchema = z
  .object({
    ok: z.boolean(),
    summary: z
      .object({ boards: z.array(boardSummarySchema).max(16) })
      .strict()
      .optional(),
    evidence: evidenceSchema,
  })
  .strict();
export const toolchainCheckSchema = z
  .object({
    id: z.enum([
      'repository-manifest',
      'west',
      'python3',
      'cmake',
      'ninja',
      'zephyr-base',
      'zephyr-sdk',
      'arm-toolchain',
      'xtensa-toolchain',
    ]),
    status: z.enum(['ready', 'missing', 'invalid', 'malformed', 'timeout', 'unavailable']),
    version: z.string().max(64).optional(),
    requiredRevision: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    observedRevision: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
  })
  .strict();
export const toolchainResultSchema = z
  .object({
    ok: z.boolean(),
    summary: z
      .object({
        scope: z.literal('local-firmware-build-prerequisites'),
        ready: z.boolean(),
        checks: z.array(toolchainCheckSchema).max(16),
        boards: z
          .array(
            z
              .object({
                ideId: z.string().max(64),
                zephyrBoard: z.string().max(128),
                validationLevel: z.enum(['cross-build', 'human-hil']),
              })
              .strict(),
          )
          .max(16),
      })
      .strict(),
    evidence: evidenceSchema,
  })
  .strict();
export const firmwareResultSchema = z
  .object({
    ok: z.boolean(),
    summary: z
      .object({
        schemaVersion: z.literal(1),
        scope: z.literal('local-ephemeral-cross-build'),
        sourceIdentity: z.literal('unverified'),
        board: boardSummarySchema,
        artifact: artifactSchema.extend({ kind: z.literal('firmware-elf') }).strict(),
        output: z
          .object({
            stdoutBytes: z
              .number()
              .int()
              .nonnegative()
              .max(8 * 1024 * 1024),
            stderrBytes: z
              .number()
              .int()
              .nonnegative()
              .max(8 * 1024 * 1024),
            truncated: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    evidence: evidenceSchema,
  })
  .strict();
export const outputName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/);
export const outputsSchema = z.record(outputName, z.boolean()).refine((outputs) => Object.keys(outputs).length <= 64);
export const plantSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('motor-v1'), atSpeedInput: z.boolean(), speedPermilleAfterTick: z.number().int().min(0).max(1000) }).strict(),
  z
    .object({
      kind: z.literal('conveyor-v1'),
      seed: z.literal(0),
      partAtClassifierInput: z.boolean(),
      metalDetectedInput: z.boolean(),
      partAtDiverterInput: z.boolean(),
      jamDetectedInput: z.boolean(),
      classifiedCountAfterTick: z.number().int().min(0).max(1_000_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tank-v1'),
      levelLowInput: z.boolean(),
      levelHighInput: z.boolean(),
      levelPermilleAfterTick: z.number().int().min(0).max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('pedestrian-v1'),
      requestInput: z.boolean(),
      phaseAfterTick: z.enum(['approaching', 'waiting', 'crossing', 'cleared']),
    })
    .strict(),
]);
export const traceSampleSchema = z
  .object({ atMs: z.number().int().min(0).max(3_600_000), outputs: outputsSchema, plant: plantSchema.optional() })
  .strict();
export const assertionSchema = z
  .object({
    kind: z.enum(['AT', 'WITHIN', 'EVENTUALLY', 'ALWAYS', 'NEVER', 'UNTIL', 'FOR', 'RISING', 'FALLING']),
    passed: z.boolean(),
    atMs: z.number().int().min(0).max(3_600_000).optional(),
  })
  .strict();
export const checkSchema = z
  .object({
    signal: z.string().min(1).max(256),
    expected: z.union([z.boolean(), z.number(), z.object({ min: z.number().optional(), max: z.number().optional() }).strict()]),
    observed: z.union([z.boolean(), z.number()]).optional(),
  })
  .strict();
// the Tool API's TestRunPreview: the failure detail (checks) of tests_run and scenario_run
export const previewSchema = z
  .object({
    schemaVersion: z.literal(1),
    backend: z.literal('native-posix'),
    mode: z.literal('logical-cyclic-task-set-scan'),
    traceEvidenceSha256: z.string().regex(/^[0-9a-f]{64}$/),
    totalScenarioCount: z.number().int().min(1).max(8),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().max(128),
            path: logicalPathSchema,
            passed: z.boolean(),
            totalSamples: z.number().int().nonnegative(),
            totalSignals: z.number().int().nonnegative(),
            totalAssertions: z.number().int().nonnegative(),
            truncated: z.boolean(),
            assertions: z
              .array(
                assertionSchema
                  .extend({ index: z.number().int().nonnegative().optional(), checks: z.array(checkSchema).max(8).optional() })
                  .strict(),
              )
              .max(32),
            samples: z.array(traceSampleSchema).max(24),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const aggregateScenarioSchema = z
  .object({
    id: z
      .string()
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    path: logicalPathSchema.refine((path) => path.startsWith('tests/')),
    passed: z.boolean(),
    trace: z.array(traceSampleSchema).min(1).max(100_000),
    assertions: z.array(assertionSchema).max(4096),
  })
  .strict();
export const aggregateTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    backend: z.literal('native-posix'),
    mode: z.literal('logical-cyclic-task-set-scan'),
    scenarios: z.array(aggregateScenarioSchema).min(1).max(8),
  })
  .strict();

const debugStaleFields = {
  stale: z.boolean(),
  nextStep: shortText.optional(),
};

const debugPositionFields = {
  atMs: z.number().int().nonnegative(),
  cycles: z.number().int().nonnegative(),
  state: z.enum(['idle', 'paused', 'error']),
  location: z
    .object({
      pou: z.string().min(1).max(128).optional(),
      file: logicalPathSchema.optional(),
      element: z.string().min(1).max(128).optional(),
      line: z.number().int().positive().optional(),
      pc: z.number().int().nonnegative(),
    })
    .strict()
    .optional(),
};

export const debugSetInputsResultSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().uuid(),
    stagedInputs: z.array(z.string().min(1).max(256)),
    stagedPlantActions: z.number().int().nonnegative(),
    ...debugStaleFields,
  })
  .strict();

export const debugBreakpointsResultSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().uuid(),
    breakpoints: z.array(
      z
        .object({
          file: logicalPathSchema,
          element: z.string().min(1).max(128),
          line: z.number().int().positive().optional(),
          pc: z.number().int().nonnegative(),
          active: z.boolean(),
        })
        .strict(),
    ),
    ...debugStaleFields,
  })
  .strict();

export const debugStepResultSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().uuid(),
    stopReason: z.enum(['stepped', 'breakpoint', 'fault', 'budget_reached']),
    ...debugPositionFields,
    cyclesExecuted: z.number().int().nonnegative(),
    vmError: z.number().int().nonnegative().optional(),
    values: z.record(z.string().min(1).max(256), z.union([z.boolean(), z.number()])).optional(),
    plantFacts: z.record(z.string(), z.unknown()).optional(),
    ...debugStaleFields,
  })
  .strict();

export const debugInspectResultSchema = z
  .object({
    ok: z.literal(true),
    sessionId: z.string().uuid(),
    ...debugPositionFields,
    signals: z.record(
      z.string().min(1).max(256),
      z
        .object({
          type: z.string().min(1).max(64),
          region: z.string().min(1).max(16),
          value: z.union([z.boolean(), z.number()]),
        })
        .strict(),
    ),
    functionBlocks: z
      .record(z.string().min(1).max(256), z.record(z.string().min(1).max(256), z.union([z.boolean(), z.number()])))
      .optional(),
    sfc: z.array(z.record(z.string(), z.unknown())).optional(),
    plant: z
      .object({
        signals: z.record(z.string(), z.union([z.boolean(), z.number()])),
        facts: z.record(z.string(), z.unknown()),
      })
      .strict()
      .optional(),
    ...debugStaleFields,
  })
  .strict();
