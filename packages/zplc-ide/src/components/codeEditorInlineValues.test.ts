import { describe, expect, it } from 'bun:test';

import type { PLCLanguage } from '../types';
import {
  buildInlineWidgets,
  extractVariablesFromCode,
  stripCommentsPreserveLayout,
} from './codeEditorInlineValues';

const ST_LANGUAGE: PLCLanguage = 'ST';

describe('stripCommentsPreserveLayout', () => {
  it('removes inline // comments while preserving line structure', () => {
    const source = 'Counter := Counter + 1; // Counter should not count here';
    const stripped = stripCommentsPreserveLayout(source);

    expect(stripped).toContain('Counter := Counter + 1; ');
    expect(stripped).not.toContain('should not count here');
    expect(stripped.length).toBe(source.length);
  });

  it('removes multiline (* *) comments across lines while preserving newlines', () => {
    const source = [
      'Counter := Counter + 1;',
      '(* SlowCounter LED_State',
      '   LED_Output PWR *)',
      'LED_State := TRUE;',
    ].join('\n');

    const stripped = stripCommentsPreserveLayout(source);

    expect(stripped.split('\n')).toHaveLength(4);
    expect(stripped).not.toContain('SlowCounter');
    expect(stripped).toContain('LED_State := TRUE;');
  });

  it('does not treat comment markers inside strings as comments', () => {
    const source = `Message := 'literal // not comment'; Note := '(* still not comment *)';`;
    const stripped = stripCommentsPreserveLayout(source);

    expect(stripped).toContain(`'literal // not comment'`);
    expect(stripped).toContain(`'(* still not comment *)'`);
  });
});

describe('extractVariablesFromCode', () => {
  it('ignores identifiers inside inline comments and block comments', () => {
    const source = [
      'VAR',
      '    Counter : INT := 0; // FakeVar',
      '    SlowCounter : INT := 0;',
      'END_VAR',
      '',
      'Counter := Counter + 1; // LED_Output PWR',
      '(* LED_State FakeFB.Q',
      '   SlowCounter Counter *)',
      'SlowCounter := SlowCounter + 1;',
    ].join('\n');

    const variables = extractVariablesFromCode(source, ST_LANGUAGE);

    expect(variables.has('Counter')).toBe(true);
    expect(variables.has('SlowCounter')).toBe(true);
    expect(variables.has('FakeVar')).toBe(false);
    expect(variables.has('LED_Output')).toBe(false);
    expect(variables.has('PWR')).toBe(false);
    expect(variables.has('LED_State')).toBe(false);
    expect(variables.has('FakeFB.Q')).toBe(false);
  });
});

describe('buildInlineWidgets', () => {
  it('does not render widgets for identifiers that appear only inside comments', () => {
    const source = [
      'Counter := Counter + 1; // LED_State',
      '(*',
      '  PWR := TRUE;',
      '*)',
      'LED_Output := Counter > 10;',
    ].join('\n');

    const values = new Map([
      ['Counter', { value: '42', type: 'INT', isBool: false }],
      ['LED_State', { value: 'TRUE', type: 'BOOL', isBool: true, isTrue: true }],
      ['PWR', { value: 'TRUE', type: 'BOOL', isBool: true, isTrue: true }],
      ['LED_Output', { value: 'FALSE', type: 'BOOL', isBool: true, isTrue: false }],
    ]);

    const widgets = buildInlineWidgets(source, values);
    const variableNames = widgets.map((widget) => widget.variableName);

    expect(variableNames).toContain('Counter');
    expect(variableNames).toContain('LED_Output');
    expect(variableNames).not.toContain('LED_State');
    expect(variableNames).not.toContain('PWR');
  });
});
