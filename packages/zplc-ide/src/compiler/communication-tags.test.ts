import { describe, expect, it } from 'bun:test';
import { applyCommunicationTags, compileMultiTaskProject } from './index';
import type { CommunicationTagConfig } from '../types';

describe('applyCommunicationTags', () => {
  it('annotates existing variables with runtime tags', () => {
    const source = `PROGRAM Main
VAR
    Pressure : REAL;
    PumpRun : BOOL;
END_VAR

END_PROGRAM`;

    const tags: CommunicationTagConfig[] = [
      { name: 'Pressure', symbol: 'Pressure', type: 'REAL', mode: 'publish' },
      { name: 'PumpRun', symbol: 'PumpRun', type: 'BOOL', mode: 'modbus', modbusAddress: 40001 },
    ];

    const transformed = applyCommunicationTags(source, tags);

    expect(transformed).toContain('Pressure : REAL {publish};');
    expect(transformed).toContain('PumpRun : BOOL {modbus:40001};');
  });

  it('injects missing symbols into first VAR block', () => {
    const source = `PROGRAM Main
VAR
    LocalCounter : INT;
END_VAR

END_PROGRAM`;

    const tags: CommunicationTagConfig[] = [
      { name: 'MotorSpeed', symbol: 'MotorSpeed', type: 'REAL', mode: 'subscribe' },
    ];

    const transformed = applyCommunicationTags(source, tags);

    expect(transformed).toContain('MotorSpeed : REAL {subscribe};');
    expect(transformed).toContain('LocalCounter : INT;');
  });

  it('supports multiple bindings on the same variable', () => {
    const source = `PROGRAM Main
VAR
    Pressure : REAL;
END_VAR

END_PROGRAM`;

    const tags: CommunicationTagConfig[] = [
      {
        name: 'Pressure',
        symbol: 'Pressure',
        type: 'REAL',
        publish: true,
        subscribe: true,
        modbusAddress: 40010,
      },
    ];

    const transformed = applyCommunicationTags(source, tags);

    expect(transformed).toContain('Pressure : REAL {publish} {subscribe} {modbus:40010};');
  });

  it('supports Modbus helper directives in ST source', () => {
    const source = `PROGRAM Main
VAR
    PumpRun : BOOL;
END_VAR

MODBUS_COIL(PumpRun, 1);

END_PROGRAM`;

    const transformed = applyCommunicationTags(source, []);

    expect(transformed).toContain('PumpRun : BOOL {modbus:1};');
  });

  it('keeps every line of the source where it was, so a diagnostic names the line the author sees (CMP-006)', () => {
    const source = `PROGRAM Main
VAR
    Pressure : REAL;
    PumpRun : BOOL;
END_VAR

MODBUS_COIL(PumpRun, 1);

Pressure := 1.0;
END_PROGRAM`;
    const tags: CommunicationTagConfig[] = [
      { name: 'Pressure', symbol: 'Pressure', type: 'REAL', publish: true },
      { name: 'Missing', symbol: 'Missing', type: 'INT', mode: 'publish', description: 'declared by the project, not by the file' },
      { name: 'Missing2', symbol: 'Missing2', type: 'BOOL', mode: 'subscribe' },
    ];
    const transformed = applyCommunicationTags(source, tags);
    const lines = transformed.split('\n');

    expect(lines.length).toBe(source.split('\n').length);
    expect(lines[6]).toBe('');
    // the declaration is annotated and the assignment that starts like it is not
    expect(transformed).toContain('Pressure : REAL {publish};');
    expect(transformed).toContain('PumpRun : BOOL {modbus:1};');
    expect(lines[8]).toBe('Pressure := 1.0;');
  });

  it('adds the declarations on new lines only when the VAR line has a comment to protect', () => {
    // ponytail: a line that ends in a comment cannot take text after it; the lines below it then move by one
    const source = 'PROGRAM Main\nVAR // locals\n    x : INT;\nEND_VAR\nEND_PROGRAM';
    const transformed = applyCommunicationTags(source, [{ name: 'Added', symbol: 'Added', type: 'BOOL', mode: 'publish' }]);
    expect(transformed.split('\n')).toEqual(['PROGRAM Main', 'VAR // locals', '    Added : BOOL {publish};', '    x : INT;', 'END_VAR', 'END_PROGRAM']);
  });

  it('puts a declaration the project adds on the VAR line when that line has no comment', () => {
    const source = 'PROGRAM Main\nVAR\n    x : INT;\nEND_VAR\n  x := 1;\nEND_PROGRAM';
    const transformed = applyCommunicationTags(source, [{ name: 'Added', symbol: 'Added', type: 'BOOL', mode: 'publish' }]);
    expect(transformed.split('\n').length).toBe(source.split('\n').length);
    expect(transformed.split('\n')[1]).toContain('Added : BOOL {publish};');
    expect(transformed.split('\n')[4]).toBe('  x := 1;');
  });

  it('reports a build error at the line of the author whatever the project adds or removes', () => {
    const config = {
      name: 'Tags',
      version: '1.0.0',
      tasks: [{ name: 'Main', trigger: 'cyclic' as const, interval_ms: 10, priority: 1, programs: ['Main.st'] }],
      communication: { tags: [{ name: 'Added', symbol: 'Added', type: 'BOOL' as const, mode: 'publish' as const }] },
    };
    const content = 'PROGRAM Main\nVAR\n  x : INT;\nEND_VAR\n  MODBUS_HOLDING_REGISTER(x, 1);\n  x := ;\n  x := nope;\nEND_PROGRAM\n';
    try {
      compileMultiTaskProject(config as never, [{ name: 'Main.st', content, language: 'ST', sourceRef: 'src/Main.st' }]);
      throw new Error('expected the build to fail');
    } catch (error) {
      const errors = (error as { errors: Array<{ line: number; column: number }> }).errors;
      expect(errors.map((each) => [each.line, each.column])).toEqual([[6, 8]]);
    }
  });
});
