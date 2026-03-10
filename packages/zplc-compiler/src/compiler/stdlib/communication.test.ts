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
