import { describe, expect, it } from 'bun:test';
import { applyCommunicationTags } from './index';
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
});
