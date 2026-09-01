import { describe, expect, it } from 'bun:test';

import { presentFirmwareBuildResult, presentToolchainInspectResult } from './toolchainPresentation';
import { getBoardEvidenceSummary } from '../../config/boardProfiles';

const checks = [
  'repository-manifest', 'west', 'python3', 'cmake', 'ninja',
  'zephyr-base', 'zephyr-sdk', 'arm-toolchain', 'xtensa-toolchain',
] as const;

const boards = [
  ['rpi_pico', 'rpi_pico'], ['waveshare_rp2040_zero', 'waveshare_rp2040_zero'], ['nucleo_h743zi', 'nucleo_h743zi'],
  ['stm32f746g_disco', 'stm32f746g_disco'], ['arduino_giga_r1', 'arduino_giga_r1/stm32h747xx/m7'], ['esp32s3_devkitc', 'esp32s3_devkitc/esp32s3/procpu'],
].map(([ideId, zephyrBoard]) => ({ ideId, zephyrBoard, validationLevel: 'cross-build' }));

function diagnostic() {
  return { code: 'TOOLCHAIN_WEST_MISSING', message: 'Toolchain prerequisite is unavailable' };
}

function studioExecution(
  operation: 'toolchain-inspect' | 'firmware-build',
  permission: 'toolchain:inspect' | 'firmware:build',
  outcome: 'passed' | 'failed' | 'cancelled' = 'passed',
) {
  return {
    schemaVersion: 1,
    jobId: '018f4e1d-d941-4a8b-b5f7-8d15d9810001',
    actor: 'human-studio',
    permission,
    operation,
    outcome,
    startedAt: '2026-08-31T12:00:00.000Z',
    finishedAt: '2026-08-31T12:00:01.000Z',
  };
}

function result() {
  return {
    ok: true,
    summary: {
      scope: 'local-firmware-build-prerequisites',
      ready: true,
      checks: checks.map((id) => ({ id, status: 'ready' })),
      boards: structuredClone(boards),
    },
    evidence: { schemaVersion: 1, operation: 'toolchain-inspect', outcome: 'passed', diagnostics: [], artifacts: [] },
  };
}

function attention() {
  const incomplete = result();
  incomplete.ok = false;
  incomplete.summary.ready = false;
  incomplete.summary.checks[1] = { id: 'west', status: 'missing' };
  incomplete.evidence = { ...incomplete.evidence, outcome: 'failed', diagnostics: [diagnostic()] };
  return incomplete;
}

describe('presentToolchainInspectResult', () => {
  it('keeps catalogued board evidence scoped to cross-build and hides flash until HIL qualification', () => {
    expect(getBoardEvidenceSummary('stm32f746g_disco')).toEqual({
      zephyrBoard: 'stm32f746g_disco/stm32f746xx', validationLevel: 'cross-build', evidenceCount: 0,
    });
    expect(getBoardEvidenceSummary('custom')).toBeUndefined();
  });
  it('only presents all nine ready checks as ready for a local build', () => {
    const presentation = presentToolchainInspectResult(result());

    expect(presentation.kind).toBe('ready');
    expect(presentation.message).toBe('Ready for local build');
    expect(presentation.checks).toHaveLength(9);
    expect(presentation.boardIdeIds).toEqual(boards.map((board) => board.ideId));
    expect(JSON.stringify(presentation)).not.toContain('zephyrBoard');
  });

  it('keeps a missing prerequisite as attention with static remediation', () => {
    const presentation = presentToolchainInspectResult(attention());

    expect(presentation.kind).toBe('attention');
    expect(presentation.checks[1]).toMatchObject({ status: 'missing' });
    expect(presentation.checks[1]?.remediation).toContain('Install west');
  });

  it('accepts a validated Studio execution envelope without rendering it', () => {
    const value = { ...result(), execution: studioExecution('toolchain-inspect', 'toolchain:inspect') };
    const presentation = presentToolchainInspectResult(value);

    expect(presentation.kind).toBe('ready');
    expect(JSON.stringify(presentation)).not.toContain('human-studio');
    expect(JSON.stringify(presentation)).not.toContain('jobId');
  });

  it('fails closed for malformed Studio execution envelopes', () => {
    const value = { ...result(), execution: { ...studioExecution('toolchain-inspect', 'toolchain:inspect'), root: '/do-not-render' } };
    expect(presentToolchainInspectResult(value).kind).toBe('unavailable');
    expect(presentToolchainInspectResult({ ...result(), execution: { ...studioExecution('toolchain-inspect', 'toolchain:inspect'), operation: 'compile' } }).kind).toBe('unavailable');
  });

  it('fails closed for malformed, contradictory, or secret-bearing results', () => {
    expect(presentToolchainInspectResult({ ...result(), ok: false }).kind).toBe('unavailable');
    expect(presentToolchainInspectResult({ ...result(), summary: { ...result().summary, checks: result().summary.checks.slice(1) } }).kind).toBe('unavailable');
    expect(presentToolchainInspectResult({ ...result(), summary: { ...result().summary, scope: 'target-hil' }, secret: 'do-not-render' }).kind).toBe('unavailable');
    expect(presentToolchainInspectResult({ ...result(), summary: { ...result().summary, secret: 'do-not-render' } }).kind).toBe('unavailable');
    const missingEvidence = result() as Record<string, unknown>;
    delete missingEvidence.evidence;
    expect(presentToolchainInspectResult(missingEvidence).kind).toBe('unavailable');
  });

  it('fails closed for invalid evidence contracts', () => {
    const failedReady = result();
    failedReady.evidence.outcome = 'failed';
    expect(presentToolchainInspectResult(failedReady).kind).toBe('unavailable');
    const invalidArtifacts = attention();
    invalidArtifacts.evidence.artifacts = [{ kind: 'trace' }];
    expect(presentToolchainInspectResult(invalidArtifacts).kind).toBe('unavailable');
    const invalidDiagnostics = attention();
    invalidDiagnostics.evidence.diagnostics = Array.from({ length: 10 }, diagnostic);
    expect(presentToolchainInspectResult(invalidDiagnostics).kind).toBe('unavailable');
    const secretEvidence = attention() as { evidence: Record<string, unknown> };
    secretEvidence.evidence.secret = 'do-not-render';
    expect(presentToolchainInspectResult(secretEvidence).kind).toBe('unavailable');
  });

  it('fails closed for malformed board catalogues and revisions', () => {
    const arbitraryBoards = result();
    arbitraryBoards.summary.boards = [];
    expect(presentToolchainInspectResult(arbitraryBoards).kind).toBe('unavailable');
    const oneBoard = attention();
    oneBoard.summary.boards = oneBoard.summary.boards.slice(0, 1);
    expect(presentToolchainInspectResult(oneBoard).kind).toBe('unavailable');
    const tooManyBoards = attention();
    tooManyBoards.summary.boards = [...tooManyBoards.summary.boards, ...tooManyBoards.summary.boards.slice(0, 1)];
    expect(presentToolchainInspectResult(tooManyBoards).kind).toBe('unavailable');
    const duplicateBoards = attention();
    duplicateBoards.summary.boards[1] = { ...duplicateBoards.summary.boards[1]!, ideId: duplicateBoards.summary.boards[0]!.ideId };
    expect(presentToolchainInspectResult(duplicateBoards).kind).toBe('unavailable');
    const extraBoardField = attention() as { summary: { boards: Array<Record<string, unknown>> } };
    extraBoardField.summary.boards[0]!.secret = 'do-not-render';
    expect(presentToolchainInspectResult(extraBoardField).kind).toBe('unavailable');
    const invalidRevision = result() as { summary: { checks: Array<Record<string, unknown>> } };
    invalidRevision.summary.checks[5] = { ...invalidRevision.summary.checks[5]!, requiredRevision: 'not-a-sha' };
    expect(presentToolchainInspectResult(invalidRevision).kind).toBe('unavailable');
    invalidRevision.summary.checks[5] = { ...invalidRevision.summary.checks[5]!, requiredRevision: 'a'.repeat(40), observedRevision: 'UPPERCASE'.padEnd(40, 'A') };
    expect(presentToolchainInspectResult(invalidRevision).kind).toBe('unavailable');
  });

  it('accepts only bounded safe versions and never presents hardware qualification', () => {
    const valid = result() as Record<string, unknown>;
    const summary = valid.summary as Record<string, unknown>;
    const readyChecks = summary.checks as Array<Record<string, unknown>>;
    readyChecks[0] = { ...readyChecks[0], version: '4.0.0' };
    expect(presentToolchainInspectResult(valid).checks[0]?.version).toBe('4.0.0');
    readyChecks[0] = { ...readyChecks[0], version: '../../secret/path' };
    const presentation = presentToolchainInspectResult(valid);
    expect(presentation.kind).toBe('unavailable');
    expect(JSON.stringify(presentation)).not.toContain('HIL');
    expect(JSON.stringify(presentation)).not.toContain('secret');
  });
});

describe('presentFirmwareBuildResult', () => {
  function success() {
    const sha256 = 'a'.repeat(64);
    const artifact = { kind: 'firmware-elf', sha256, byteLength: 52 };
    return {
      ok: true,
      summary: {
        schemaVersion: 1, scope: 'local-ephemeral-cross-build', sourceIdentity: 'unverified',
        board: { boardId: 'do-not-render', ideId: 'rpi_pico', zephyrBoard: 'rpi_pico', validationLevel: 'cross-build' },
        artifact, output: { stdoutBytes: 0, stderrBytes: 0, truncated: false },
      },
      evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'passed', diagnostics: [], artifacts: [artifact] },
    };
  }

  it('presents only coherent local ephemeral build evidence', () => {
    const value = success();
    const presentation = presentFirmwareBuildResult(value);

    expect(presentation).toEqual({ kind: 'success', ideId: 'rpi_pico', sha256: value.summary.artifact.sha256, byteLength: 52 });
    expect(JSON.stringify(presentation)).not.toContain('do-not-render');
  });

  it('accepts a validated Studio execution envelope for firmware builds', () => {
    const value = { ...success(), execution: studioExecution('firmware-build', 'firmware:build') };
    expect(presentFirmwareBuildResult(value).kind).toBe('success');
  });

  it('fails closed for malformed, mismatched, or secret-bearing success results', () => {
    const extra = success() as { summary: Record<string, unknown> };
    extra.summary.secret = 'do-not-render';
    expect(presentFirmwareBuildResult(extra)).toEqual({ kind: 'failed' });
    const mismatch = success();
    mismatch.evidence.artifacts[0] = { ...mismatch.evidence.artifacts[0], byteLength: 53 };
    expect(presentFirmwareBuildResult(mismatch)).toEqual({ kind: 'failed' });
    const invalidHash = success();
    invalidHash.summary.artifact.sha256 = 'A'.repeat(64);
    expect(presentFirmwareBuildResult(invalidHash)).toEqual({ kind: 'failed' });
    const invalidOutput = success();
    invalidOutput.summary.output.truncated = true;
    expect(presentFirmwareBuildResult(invalidOutput)).toEqual({ kind: 'failed' });
    const invalidSource = success();
    invalidSource.summary.sourceIdentity = 'verified';
    expect(presentFirmwareBuildResult(invalidSource)).toEqual({ kind: 'failed' });
    const invalidSize = success();
    invalidSize.summary.artifact.byteLength = 0;
    expect(presentFirmwareBuildResult(invalidSize)).toEqual({ kind: 'failed' });
  });

  it('presents content-free cancellation and failure states only', () => {
    const failure = (code: string) => ({ ok: false, evidence: { schemaVersion: 1, operation: 'firmware-build', outcome: 'failed', diagnostics: [{ code, message: 'Firmware build is unavailable' }], artifacts: [] } });
    expect(presentFirmwareBuildResult(failure('FIRMWARE_BUILD_CANCELLED'))).toEqual({ kind: 'cancelled' });
    expect(presentFirmwareBuildResult(failure('FIRMWARE_BUILD_CLEANUP_FAILED'))).toEqual({ kind: 'cleanup-unconfirmed' });
    expect(presentFirmwareBuildResult(failure('FIRMWARE_BUILD_TIMEOUT'))).toEqual({ kind: 'failed' });
    expect(presentFirmwareBuildResult({ ...failure('FIRMWARE_BUILD_TIMEOUT'), secret: 'do-not-render' })).toEqual({ kind: 'failed' });
    expect(presentFirmwareBuildResult({ ...failure('FIRMWARE_BUILD_CANCELLED'), execution: studioExecution('firmware-build', 'firmware:build', 'cancelled') })).toEqual({ kind: 'cancelled' });
  });

  it('accepts the runner output budget as one combined eight-megabyte limit', () => {
    const valid = success();
    valid.summary.output = { stdoutBytes: 2 * 1024 * 1024, stderrBytes: 6 * 1024 * 1024, truncated: false };
    expect(presentFirmwareBuildResult(valid).kind).toBe('success');
    const invalid = success();
    invalid.summary.output = { stdoutBytes: 8 * 1024 * 1024, stderrBytes: 1, truncated: false };
    expect(presentFirmwareBuildResult(invalid)).toEqual({ kind: 'failed' });
  });
});
