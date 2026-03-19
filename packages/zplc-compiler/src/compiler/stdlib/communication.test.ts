import { test, expect, describe } from 'bun:test';
import { CommBlocks } from './communication';
import { DataType } from '../ast';

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

  test('generateCall emits correct OP_COMM_EXEC for MB_READ_HREG', () => {
    const fb = CommBlocks['MB_READ_HREG'];
    let emitted: string[] = [];
    const ctx: any = {
      emit: (str: string) => emitted.push(str.trim()),
      emitExpression: () => {}
    };

    fb.generateCall(0x1000, [{name: 'EN', value: 'node_expr'}], ctx);

    // Should push base address 0x1000
    expect(emitted).toContain('PUSH16 4096');
    // Should exec kind 0x0001
    expect(emitted).toContain('OP_COMM_EXEC 0x0001');
  });

  test('generateCall emits correct OP_COMM_EXEC for MQTT_PUBLISH', () => {
    const fb = CommBlocks['MQTT_PUBLISH'];
    let emitted: string[] = [];
    const ctx: any = {
      emit: (str: string) => emitted.push(str.trim()),
      emitExpression: () => {}
    };

    fb.generateCall(0x1000, [{name: 'EN', value: 'node_expr'}], ctx);

    expect(emitted).toContain('PUSH16 4096');
    expect(emitted).toContain('OP_COMM_EXEC 0x000b');
  });
});
