import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'bun:test';

import { VM_ERRORS, describeVmError } from './nativeTrace';

const HEADER = new URL('../../../../firmware/lib/zplc_core/include/zplc_isa.h', import.meta.url);

/** The members of `typedef enum { ... } zplc_vm_error_t;` in the C header, by name, with their numbers. */
function headerVmErrors(): Map<string, number> {
  const source = readFileSync(HEADER, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = /typedef\s+enum\s*\{([^}]*)\}\s*zplc_vm_error_t\s*;/.exec(source)?.[1];
  if (body === undefined) throw new Error('zplc_vm_error_t was not found in zplc_isa.h');
  const members = [...body.matchAll(/(ZPLC_VM_[A-Z_0-9]+)\s*=\s*(0x[0-9a-f]+|\d+)/gi)];
  return new Map(members.map(([, name, value]) => [name, Number(value)]));
}

/** LX-2b: the Console trace table showed a bare 10 while the VM was paused at a breakpoint. */
describe('the VM error codes the Console trace shows', () => {
  const fromHeader = headerVmErrors();

  it('reads the enum from the C header (guards the parser below)', () => {
    expect(fromHeader.get('ZPLC_VM_OK')).toBe(0);
    expect(fromHeader.get('ZPLC_VM_PAUSED')).toBe(10);
    expect(fromHeader.size).toBeGreaterThanOrEqual(11);
  });

  // Fails when zplc_isa.h gains a code the table lacks, or a number moves, or the table keeps a code the header dropped.
  it('has every zplc_vm_error_t value, under the same name and number, and nothing else', () => {
    expect(new Map(VM_ERRORS.map((entry) => [entry.name, entry.code]))).toEqual(fromHeader);
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
