import { describe, expect, it } from 'bun:test';

import { ZPLC_CONSTANTS, ZPLC_CONTRACT } from '@zplc/compiler';

import { artifactDraftCounter, describeLoadFailure, draftMismatchMessage } from './draftCounter';

function header(counter: number, magic: number = ZPLC_CONSTANTS.MAGIC): Uint8Array {
  const bytes = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE + 3);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, counter, true);
  return bytes;
}

describe('draft contract counter helpers (CMP-052)', () => {
  it('reads the counter from header word 28 and nothing else', () => {
    expect(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET).toBe(28);
    expect(artifactDraftCounter(header(7))).toBe(7);
    expect(artifactDraftCounter(header(0))).toBe(0);
    expect(artifactDraftCounter(header(0xffff_ffff))).toBe(0xffff_ffff);
  });

  it('reads it from a view into a larger buffer', () => {
    const whole = new Uint8Array(100);
    whole.set(header(9), 10);
    expect(artifactDraftCounter(whole.subarray(10))).toBe(9);
  });

  it('has no counter for bytes that are not a ZPLC artifact', () => {
    expect(artifactDraftCounter(new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE - 1))).toBeNull();
    expect(artifactDraftCounter(header(3, 0x12345678))).toBeNull();
  });

  it('words every refusal the same way, with none for a missing counter', () => {
    expect(draftMismatchMessage(2, 5)).toBe('Program was built for contract draft 2, this runtime is draft 5');
    expect(draftMismatchMessage(0, 5)).toBe('Program was built for contract draft none, this runtime is draft 5');
    expect(draftMismatchMessage(2, null)).toBe('Program was built for contract draft 2, this runtime is draft none');
    expect(draftMismatchMessage(null, 5)).toBe('Program was built for contract draft none, this runtime is draft 5');
  });

  it('words the failure of a runtime that returns only the loader code (the WASM module)', () => {
    const draft = ZPLC_CONTRACT.LOADER_ERRORS.find((entry) => entry.name === 'ZPLC_LOADER_ERR_DRAFT')!.code;
    const foreign = ZPLC_CONSTANTS.DRAFT_COUNTER + 4;
    expect(describeLoadFailure(draft, header(foreign))).toBe(
      `Program was built for contract draft ${foreign}, this runtime is draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}`,
    );
    expect(describeLoadFailure(draft, header(0))).toBe(
      `Program was built for contract draft none, this runtime is draft ${ZPLC_CONSTANTS.DRAFT_COUNTER}`,
    );
    expect(describeLoadFailure(-6, header(1))).toBe('Failed to load program: -6');
  });
});
