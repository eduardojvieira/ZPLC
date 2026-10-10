import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';
import { ZPLC_CONTRACT } from '@zplc/compiler';

import { VM_ERRORS, describeVmError } from './nativeTrace';

/** LX-2b: the Console trace table showed a bare 10 while the VM was paused at a breakpoint. */
describe('the VM error codes the Console trace shows', () => {
  // The contract file is the single source of the C header and of the generated table (VF-012, `bun run contract:check`).
  const fromContract = new Map(ZPLC_CONTRACT.VM_ERRORS.map((entry) => [entry.name, entry.code]));

  it('has the contract of the VM error codes, from OK to PAUSED', () => {
    expect(fromContract.get('ZPLC_VM_OK')).toBe(0);
    expect(fromContract.get('ZPLC_VM_PAUSED')).toBe(10);
    expect(fromContract.size).toBeGreaterThanOrEqual(11);
  });

  // Fails when the contract gains a code the table lacks, or a number moves, or the table keeps a code the contract dropped.
  it('has every zplc_vm_error_t value of the contract, under the same name and number, and nothing else', () => {
    expect(new Map(VM_ERRORS.map((entry) => [entry.name, entry.code]))).toEqual(fromContract);
    expect(new Set(VM_ERRORS.map((entry) => entry.code)).size).toBe(VM_ERRORS.length);
  });

  // Fails while describeVmError returns the bare number.
  it.each([[0, '0 ok'], [3, '3 division by zero'], [9, '9 halted'], [10, '10 paused']])('shows %i as "%s"', (code, text) => {
    expect(describeVmError(code)).toBe(text);
  });

  it('gives every known code a plain-English label that starts with its number', () => {
    for (const entry of VM_ERRORS) {
      expect(describeVmError(entry.code)).toBe(`${entry.code} ${entry.label}`);
      expect(entry.label).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });

  // Fails while the trace table prints sample.error as it is (components/Console.tsx).
  it('is what the Error column of the Console trace table calls', () => {
    const console = readFileSync(new URL('../components/Console.tsx', import.meta.url), 'utf8');
    expect(console).toContain('{describeVmError(sample.error)}');
    expect(console).not.toContain("{sample.error ?? '—'}");
  });

  it('keeps an unknown code as its number and no code as a dash', () => {
    expect(describeVmError(11)).toBe('11');
    expect(describeVmError(-1)).toBe('-1');
    expect(describeVmError(null)).toBe('—');
  });
});
