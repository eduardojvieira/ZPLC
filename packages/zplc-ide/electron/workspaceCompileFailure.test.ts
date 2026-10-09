import { describe, expect, it } from 'bun:test';

import { workspaceCompileFailure } from './workspaceCompileFailure';

const failure = (...diagnostics: unknown[]) => ({ ok: false, evidence: { outcome: 'failed', diagnostics } });
const first = (value: unknown) => workspaceCompileFailure(value).evidence.diagnostics[0];

describe('the failure sent to the renderer after a build', () => {
  it('keeps the code, a relative path and the position of each diagnostic', () => {
    expect(workspaceCompileFailure(failure({ code: 'COMPILATION_FAILED', path: 'src/Motor.st', line: 31, column: 1, phase: 'codegen', extra: 'x' }))).toEqual({
      ok: false,
      evidence: { outcome: 'failed', diagnostics: [{ code: 'COMPILATION_FAILED', path: 'src/Motor.st', line: 31, column: 1 }] },
    });
  });

  it('drops a path that is absolute or leaves the project, and a position that is not a line number', () => {
    for (const path of ['/etc/passwd', '\\share\\x', 'C:\\x.st', '../x.st', 'src/../../x.st', 'a\0b', '']) {
      expect(first(failure({ code: 'COMPILATION_FAILED', path }))).toEqual({ code: 'COMPILATION_FAILED' });
    }
    expect(first(failure({ code: 'COMPILATION_FAILED', line: 0, column: 1.5 }))).toEqual({ code: 'COMPILATION_FAILED' });
  });

  it('keeps at most 128 diagnostics and skips one without a usable code', () => {
    const many = Array.from({ length: 200 }, () => ({ code: 'COMPILATION_FAILED' }));
    expect(workspaceCompileFailure(failure(...many)).evidence.diagnostics).toHaveLength(128);
    expect(workspaceCompileFailure(failure({ code: '' }, { code: 7 }, null, { code: 'X'.repeat(97) }, { code: 'OK' })).evidence.diagnostics).toEqual([{ code: 'OK' }]);
  });

  it('answers a result of any other shape with no diagnostics', () => {
    for (const value of [undefined, null, 'x', [], {}, { evidence: [] }, { evidence: { diagnostics: 'x' } }]) {
      expect(workspaceCompileFailure(value)).toEqual({ ok: false, evidence: { outcome: 'failed', diagnostics: [] } });
    }
  });
});

describe('the compiler message of a diagnostic (CMP-010)', () => {
  const message = (text: unknown) => first(failure({ code: 'COMPILATION_FAILED', message: text })) as { message?: string };

  it('reaches the renderer with the diagnostic it belongs to', () => {
    expect(first(failure({ code: 'COMPILATION_FAILED', message: "Unknown identifier 'UndefinedVariable'", path: 'src/Motor.st', line: 31, column: 1 })))
      .toEqual({ code: 'COMPILATION_FAILED', message: "Unknown identifier 'UndefinedVariable'", path: 'src/Motor.st', line: 31, column: 1 });
  });

  it('is cut at 300 characters, by character and not in the middle of a pair', () => {
    expect(message('x'.repeat(300)).message).toBe('x'.repeat(300));
    expect(message('x'.repeat(301)).message).toBe('x'.repeat(300));
    expect(message('😀'.repeat(400)).message).toBe('😀'.repeat(300));
  });

  it('has its control characters and line breaks replaced by one space', () => {
    expect(message('bad\u0000 thing\n\tnext\u001b[31m red\u007f.\u0085end').message).toBe('bad thing next [31m red . end');
    expect(message('first\r\nsecond').message).toBe('first second');
  });

  it('shows no absolute path of the machine, only the relative project paths', () => {
    expect(message('Cannot read /home/eduardo/plant/zplc.json').message).toBe('Cannot read <path>');
    expect(message("Cannot open '/Users/eve/Motor.st' or (/tmp/x)").message).toBe("Cannot open '<path>' or (<path>");
    expect(message('Cannot read C:\\Users\\eve\\plant\\src\\Motor.st now').message).toBe('Cannot read <path> now');
    expect(message('Cannot read D:/work/plant/zplc.json').message).toBe('Cannot read <path>');
    expect(message('Cannot read \\\\server\\share\\zplc.json').message).toBe('Cannot read <path>');
    expect(message('Error in src/Motor.st at ./lib/x.st and ../y.st').message).toBe('Error in src/Motor.st at ./lib/x.st and ../y.st');
    expect(message("Operator '/=' needs numbers; a / b and 3/4 stay").message).toBe("Operator '/=' needs numbers; a / b and 3/4 stay");
  });

  it('is left out when it is not text or says nothing', () => {
    for (const text of [undefined, null, 7, {}, [], '', '   ', '\n\u0000']) expect(first(failure({ code: 'COMPILATION_FAILED', message: text }))).toEqual({ code: 'COMPILATION_FAILED' });
  });
});
