import { test, expect, describe } from 'bun:test';
import { CommBlocks } from './communication';
import { DataType } from '../ast';

// The context below emits no expression, so the argument only has to be a well-formed node.
const ENABLE = { name: 'EN', value: { kind: 'Identifier' as const, name: 'node_expr', line: 1, column: 1 } };

describe('Communication FBs (Phase 1 & 2)', () => {

  test('MB_READ_HREG has correct size and basics', () => {
    const fb = CommBlocks['MB_READ_HREG'];
    expect(fb).toBeDefined();
    expect(fb.size).toBe(110);
    
    const status = fb.members.find(m => m.name === 'STATUS');
    expect(status?.offset).toBe(4);
    expect(status?.type).toBe(DataType.DINT);
  });

  test('MQTT_PUBLISH has correct size and basics', () => {
    const fb = CommBlocks['MQTT_PUBLISH'];
    expect(fb).toBeDefined();
    expect(fb.size).toBe(190);
    
    const status = fb.members.find(m => m.name === 'STATUS');
    expect(status?.offset).toBe(4);
    expect(status?.type).toBe(DataType.DINT);

    const topic = fb.members.find(m => m.name === 'TOPIC');
    expect(topic?.offset).toBe(12);
    expect(topic?.type).toBe(DataType.STRING);
  });

  test('MQTT_SUBSCRIBE exposes the deterministic handshake contract', () => {
    const fb = CommBlocks['MQTT_SUBSCRIBE'];
    expect(fb).toBeDefined();
    expect(fb.size).toBe(190);

    const valid = fb.members.find(m => m.name === 'VALID');
    expect(valid?.offset).toBe(9);
    expect(valid?.type).toBe(DataType.BOOL);

    const payload = fb.members.find(m => m.name === 'PAYLOAD');
    expect(payload?.offset).toBe(97);
    expect(payload?.type).toBe(DataType.STRING);
  });

  test('MB_WRITE_HREG preserves COUNT for multi-value contracts', () => {
    const fb = CommBlocks['MB_WRITE_HREG'];
    const count = fb.members.find(m => m.name === 'COUNT');
    const value = fb.members.find(m => m.name === 'VALUE');

    expect(count?.offset).toBe(13);
    expect(count?.type).toBe(DataType.UINT);
    expect(value?.offset).toBe(15);
    expect(value?.type).toBe(DataType.UINT);
  });

  test('generateCall emits assemblable COMM_EXEC for MB_READ_HREG', async () => {
    const fb = CommBlocks['MB_READ_HREG'];
    let emitted: string[] = [];
    const ctx: any = {
      emit: (str: string) => emitted.push(str.trim()),
      emitExpression: () => {}
    };

    fb.generateCall(0x1000, [ENABLE], ctx);

    // Should push base address 0x1000
    expect(emitted).toContain('PUSH16 4096');
    // Should exec kind 0x0001
    expect(emitted).toContain('COMM_EXEC 0x0001');
    const { assembleRaw } = await import('../../assembler');
    const bytecode = assembleRaw(emitted.filter(line => !line.startsWith(';')).join('\n'));
    expect(bytecode.slice(-5)).toEqual(new Uint8Array([0xD0, 0x01, 0x00, 0x00, 0x00]));
  });

  test('generateCall emits correct COMM_EXEC for MQTT_PUBLISH', () => {
    const fb = CommBlocks['MQTT_PUBLISH'];
    let emitted: string[] = [];
    const ctx: any = {
      emit: (str: string) => emitted.push(str.trim()),
      emitExpression: () => {}
    };

    fb.generateCall(0x1000, [ENABLE], ctx);

    expect(emitted).toContain('PUSH16 4096');
    expect(emitted).toContain('COMM_EXEC 0x000b');
  });

  // COM-005: a STRING argument is copied into the member in the layout of the string table, not stored as an address.
  test('a STRING argument is copied into its member with the capacity written first', () => {
    const fb = CommBlocks['MQTT_PUBLISH'];
    const emitted: string[] = [];
    const ctx: any = {
      emit: (str: string) => emitted.push(str.trim()),
      emitExpression: (expr: { name: string }) => emitted.push(`<${expr.name}>`),
    };
    const topic = { name: 'TOPIC', value: { kind: 'Identifier' as const, name: 'topic_text', line: 1, column: 1 } };

    fb.generateCall(0x1000, [topic], ctx);

    const at = (offset: number) => 0x1000 + offset;
    expect(emitted).toContain(`STORE16 ${at(12 + 2)}`);
    const copy = emitted.indexOf('<topic_text>');
    expect(copy).toBeGreaterThan(emitted.indexOf(`STORE16 ${at(14)}`));
    expect(emitted.slice(copy, copy + 3)).toEqual(['<topic_text>', `PUSH16 ${at(12)}`, 'STRCPY']);
    expect(emitted).not.toContain(`STORE32 ${at(12)}`);
  });
});
