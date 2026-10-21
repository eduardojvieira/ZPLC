import { describe, expect, it } from 'bun:test';

import { isSourceElementId } from '../src/models/sourceElements';
import { workspaceCompileFailure } from './workspaceCompileFailure';

const failure = (...diagnostics: unknown[]) => ({ ok: false, evidence: { outcome: 'failed', diagnostics } });
const first = (value: unknown) => workspaceCompileFailure(value).evidence.diagnostics[0];

describe('the failure sent to the renderer after a build', () => {
  it('keeps the code, a relative path and the position of each diagnostic', () => {
    expect(
      workspaceCompileFailure(
        failure({ code: 'UNKNOWN_IDENTIFIER', path: 'src/Motor.st', line: 31, column: 1, phase: 'codegen', extra: 'x' }),
      ),
    ).toEqual({
      ok: false,
      evidence: { outcome: 'failed', diagnostics: [{ code: 'UNKNOWN_IDENTIFIER', path: 'src/Motor.st', line: 31, column: 1 }] },
    });
  });

  it('drops a path that is absolute or leaves the project, and a position that is not a line number', () => {
    for (const path of ['/etc/passwd', '\\share\\x', 'C:\\x.st', '../x.st', 'src/../../x.st', 'a\0b', '']) {
      expect(first(failure({ code: 'UNKNOWN_IDENTIFIER', path }))).toEqual({ code: 'UNKNOWN_IDENTIFIER' });
    }
    expect(first(failure({ code: 'UNKNOWN_IDENTIFIER', line: 0, column: 1.5 }))).toEqual({ code: 'UNKNOWN_IDENTIFIER' });
  });

  it('keeps at most 128 diagnostics and skips one without a usable code', () => {
    const many = Array.from({ length: 200 }, () => ({ code: 'UNKNOWN_IDENTIFIER' }));
    expect(workspaceCompileFailure(failure(...many)).evidence.diagnostics).toHaveLength(128);
    expect(
      workspaceCompileFailure(failure({ code: '' }, { code: 7 }, null, { code: 'X'.repeat(97) }, { code: 'OK' })).evidence.diagnostics,
    ).toEqual([{ code: 'OK' }]);
  });

  it('answers a result of any other shape with no diagnostics', () => {
    for (const value of [undefined, null, 'x', [], {}, { evidence: [] }, { evidence: { diagnostics: 'x' } }]) {
      expect(workspaceCompileFailure(value)).toEqual({ ok: false, evidence: { outcome: 'failed', diagnostics: [] } });
    }
  });
});

describe('the compiler message of a diagnostic (CMP-010)', () => {
  const message = (text: unknown) => first(failure({ code: 'UNKNOWN_IDENTIFIER', message: text })) as { message?: string };

  it('reaches the renderer with the diagnostic it belongs to', () => {
    expect(
      first(
        failure({
          code: 'UNKNOWN_IDENTIFIER',
          message: "Unknown identifier 'UndefinedVariable'",
          path: 'src/Motor.st',
          line: 31,
          column: 1,
        }),
      ),
    ).toEqual({ code: 'UNKNOWN_IDENTIFIER', message: "Unknown identifier 'UndefinedVariable'", path: 'src/Motor.st', line: 31, column: 1 });
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
    for (const text of [undefined, null, 7, {}, [], '', '   ', '\n\u0000'])
      expect(first(failure({ code: 'UNKNOWN_IDENTIFIER', message: text }))).toEqual({ code: 'UNKNOWN_IDENTIFIER' });
  });
});

describe('the element of a diagnostic (LNG-003)', () => {
  const ELEMENTS = [
    'line:12',
    'rung:rung_1',
    'rung:rung_1/cell:0,3',
    'rung:r%3A1/element:c1',
    'block:and_1',
    'connection:w3',
    'step:s1',
    'step:s1/enter',
    'transition:t1/fire',
    'action:a1',
  ];
  const element = (value: unknown) => first(failure({ code: 'UNKNOWN_IDENTIFIER', message: 'x', element: value })) as { element?: string };

  it('crosses with the diagnostic it belongs to, whole', () => {
    for (const id of ELEMENTS) expect(element(id).element).toBe(id);
    expect(first(failure({ code: 'UNKNOWN_IDENTIFIER', path: 'src/main.ld.json', element: 'rung:rung_1/cell:0,3' }))).toEqual({
      code: 'UNKNOWN_IDENTIFIER',
      path: 'src/main.ld.json',
      element: 'rung:rung_1/cell:0,3',
    });
  });

  it('is dropped, and only it, when it is not an element id: a path, spaces, a wrong part, an overlong or a non-text value', () => {
    const wrong = [
      '/etc/passwd',
      'C:\\x',
      '../x',
      'rung:a b',
      'rung:',
      'line',
      'rung:r/cell:a,b',
      'rung:r/cell:1,2/extra',
      'step:s1/extra',
      'block:x\n',
      'rung:r\u0000',
      `rung:${'a'.repeat(300)}`,
      7,
      {},
      [],
      null,
    ];
    for (const value of wrong)
      expect(first(failure({ code: 'UNKNOWN_IDENTIFIER', line: 3, element: value }))).toEqual({ code: 'UNKNOWN_IDENTIFIER', line: 3 });
    expect(element(`rung:${'a'.repeat(251)}`).element).toBe(`rung:${'a'.repeat(251)}`);
    expect(element(`rung:${'a'.repeat(252)}`).element).toBeUndefined();
  });

  it('is judged as the renderer judges it: the two copies of the form agree', () => {
    for (const value of [
      ...ELEMENTS,
      '/x',
      'rung:a b',
      'rung:r/cell:1,x',
      `block:${'b'.repeat(251)}`,
      `block:${'b'.repeat(252)}`,
      '',
      'line:',
    ]) {
      expect(element(value).element !== undefined).toBe(isSourceElementId(value));
    }
  });
});
