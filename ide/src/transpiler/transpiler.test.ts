/**
 * Transpiler Tests
 * 
 * Tests for FBD → ST and LD → ST transpilers.
 * Verifies that visual language models generate valid Structured Text.
 */

import { describe, expect, it } from 'bun:test';
import { transpileFBDToST } from './fbdToST';
import { transpileLDToST } from './ldToST';
import type { FBDModel } from '../models/fbd';
import type { LDModel } from '../models/ld';

// =============================================================================
// FBD Transpiler Tests
// =============================================================================

describe('FBD to ST Transpiler', () => {
  
  describe('Basic Structure', () => {
    it('should generate PROGRAM header and END_PROGRAM', () => {
      const model: FBDModel = {
        name: 'TestProgram',
        variables: { local: [], outputs: [] },
        blocks: [],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('PROGRAM TestProgram');
      expect(result.source).toContain('END_PROGRAM');
    });
    
    it('should declare local variables', () => {
      const model: FBDModel = {
        name: 'VarTest',
        variables: {
          local: [
            { name: 'Counter', type: 'INT', initialValue: 0 },
            { name: 'Flag', type: 'BOOL', initialValue: true },
            { name: 'Temperature', type: 'REAL', initialValue: 25.5, comment: 'Sensor reading' }
          ],
          outputs: []
        },
        blocks: [],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Counter : INT := 0;');
      expect(result.source).toContain('Flag : BOOL := TRUE;');
      expect(result.source).toContain('Temperature : REAL := 25.5; (* Sensor reading *)');
    });
    
    it('should declare output variables with addresses', () => {
      const model: FBDModel = {
        name: 'OutputTest',
        variables: {
          local: [],
          outputs: [
            { name: 'Motor', type: 'BOOL', address: '%Q0.0', comment: 'Motor output' }
          ]
        },
        blocks: [],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('VAR_OUTPUT');
      expect(result.source).toContain('Motor AT %Q0.0 : BOOL; (* Motor output *)');
      expect(result.source).toContain('END_VAR');
    });
  });
  
  describe('Function Block Instances', () => {
    it('should declare TON timer instance', () => {
      const model: FBDModel = {
        name: 'TimerTest',
        variables: { local: [], outputs: [] },
        blocks: [
          {
            id: 'timer1',
            type: 'TON',
            instanceName: 'DelayTimer',
            position: { x: 100, y: 100 },
            comment: 'Delay before activation'
          }
        ],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('DelayTimer : TON; (* Delay before activation *)');
    });
    
    it('should generate TON function block call', () => {
      const model: FBDModel = {
        name: 'TimerCallTest',
        variables: { local: [], outputs: [] },
        blocks: [
          {
            id: 'const_true',
            type: 'constant',
            dataType: 'BOOL',
            value: true,
            position: { x: 50, y: 50 },
            outputs: [{ name: 'OUT', type: 'BOOL' }]
          },
          {
            id: 'const_time',
            type: 'constant',
            dataType: 'TIME',
            value: 'T#1s',
            position: { x: 50, y: 100 },
            outputs: [{ name: 'OUT', type: 'TIME' }]
          },
          {
            id: 'timer1',
            type: 'TON',
            instanceName: 'MyTimer',
            position: { x: 200, y: 75 },
            inputs: [
              { name: 'IN', type: 'BOOL' },
              { name: 'PT', type: 'TIME' }
            ],
            outputs: [
              { name: 'Q', type: 'BOOL' },
              { name: 'ET', type: 'TIME' }
            ]
          }
        ],
        connections: [
          { id: 'c1', from: { block: 'const_true', port: 'OUT' }, to: { block: 'timer1', port: 'IN' } },
          { id: 'c2', from: { block: 'const_time', port: 'OUT' }, to: { block: 'timer1', port: 'PT' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('MyTimer(IN := TRUE, PT := T#1s);');
    });
    
    it('should declare counter instances', () => {
      const model: FBDModel = {
        name: 'CounterTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'ctu1', type: 'CTU', instanceName: 'PartCounter', position: { x: 100, y: 100 } },
          { id: 'ctd1', type: 'CTD', instanceName: 'DownCounter', position: { x: 100, y: 200 } }
        ],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('PartCounter : CTU;');
      expect(result.source).toContain('DownCounter : CTD;');
    });
    
    it('should declare edge trigger instances', () => {
      const model: FBDModel = {
        name: 'TriggerTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'rt1', type: 'R_TRIG', instanceName: 'RisingEdge', position: { x: 100, y: 100 } },
          { id: 'ft1', type: 'F_TRIG', instanceName: 'FallingEdge', position: { x: 100, y: 200 } }
        ],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('RisingEdge : R_TRIG;');
      expect(result.source).toContain('FallingEdge : F_TRIG;');
    });
  });
  
  describe('Logic Gates', () => {
    it('should generate AND gate logic', () => {
      const model: FBDModel = {
        name: 'AndTest',
        variables: {
          local: [
            { name: 'Input1', type: 'BOOL' },
            { name: 'Input2', type: 'BOOL' }
          ],
          outputs: [{ name: 'Result', type: 'BOOL' }]
        },
        blocks: [
          { id: 'in1', type: 'input', variableName: 'Input1', position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'in2', type: 'input', variableName: 'Input2', position: { x: 50, y: 100 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'and1', type: 'AND', position: { x: 150, y: 75 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'out1', type: 'output', variableName: 'Result', position: { x: 250, y: 75 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'c1', from: { block: 'in1', port: 'OUT' }, to: { block: 'and1', port: 'IN1' } },
          { id: 'c2', from: { block: 'in2', port: 'OUT' }, to: { block: 'and1', port: 'IN2' } },
          { id: 'c3', from: { block: 'and1', port: 'OUT' }, to: { block: 'out1', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toMatch(/AND/);
      expect(result.source).toContain('Result :=');
    });
    
    it('should generate NOT gate logic', () => {
      const model: FBDModel = {
        name: 'NotTest',
        variables: {
          local: [{ name: 'Input', type: 'BOOL' }],
          outputs: [{ name: 'Output', type: 'BOOL' }]
        },
        blocks: [
          { id: 'in1', type: 'input', variableName: 'Input', position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'not1', type: 'NOT', position: { x: 150, y: 50 }, inputs: [{ name: 'IN', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'out1', type: 'output', variableName: 'Output', position: { x: 250, y: 50 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'c1', from: { block: 'in1', port: 'OUT' }, to: { block: 'not1', port: 'IN' } },
          { id: 'c2', from: { block: 'not1', port: 'OUT' }, to: { block: 'out1', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('NOT');
    });
    
    it('should generate OR gate logic', () => {
      const model: FBDModel = {
        name: 'OrTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'BOOL', value: true, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'c2', type: 'constant', dataType: 'BOOL', value: false, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'or1', type: 'OR', position: { x: 100, y: 25 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'var1', type: 'variable', variableName: 'Result', position: { x: 200, y: 25 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'or1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'or1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'or1', port: 'OUT' }, to: { block: 'var1', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toMatch(/TRUE OR FALSE/);
    });
    
    it('should generate XOR, NAND, NOR gates', () => {
      // Just verify these block types are handled
      const model: FBDModel = {
        name: 'GatesTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'BOOL', value: true, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'c2', type: 'constant', dataType: 'BOOL', value: false, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'xor1', type: 'XOR', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'nand1', type: 'NAND', position: { x: 100, y: 50 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'nor1', type: 'NOR', position: { x: 100, y: 100 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'v1', type: 'variable', variableName: 'X', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v2', type: 'variable', variableName: 'Y', position: { x: 200, y: 50 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v3', type: 'variable', variableName: 'Z', position: { x: 200, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'xor1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'xor1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'c1', port: 'OUT' }, to: { block: 'nand1', port: 'IN1' } },
          { id: 'cn4', from: { block: 'c2', port: 'OUT' }, to: { block: 'nand1', port: 'IN2' } },
          { id: 'cn5', from: { block: 'c1', port: 'OUT' }, to: { block: 'nor1', port: 'IN1' } },
          { id: 'cn6', from: { block: 'c2', port: 'OUT' }, to: { block: 'nor1', port: 'IN2' } },
          { id: 'cn7', from: { block: 'xor1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } },
          { id: 'cn8', from: { block: 'nand1', port: 'OUT' }, to: { block: 'v2', port: 'IN' } },
          { id: 'cn9', from: { block: 'nor1', port: 'OUT' }, to: { block: 'v3', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('XOR');
      expect(result.source).toContain('NOT (TRUE AND FALSE)'); // NAND
      expect(result.source).toContain('NOT (TRUE OR FALSE)');  // NOR
    });
  });
  
  describe('Comparison Operators', () => {
    it('should generate comparison operators', () => {
      const model: FBDModel = {
        name: 'CompareTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'INT', value: 10, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'c2', type: 'constant', dataType: 'INT', value: 20, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'eq1', type: 'EQ', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'lt1', type: 'LT', position: { x: 100, y: 50 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'gt1', type: 'GT', position: { x: 100, y: 100 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'v1', type: 'variable', variableName: 'IsEqual', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v2', type: 'variable', variableName: 'IsLess', position: { x: 200, y: 50 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v3', type: 'variable', variableName: 'IsGreater', position: { x: 200, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'eq1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'eq1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'c1', port: 'OUT' }, to: { block: 'lt1', port: 'IN1' } },
          { id: 'cn4', from: { block: 'c2', port: 'OUT' }, to: { block: 'lt1', port: 'IN2' } },
          { id: 'cn5', from: { block: 'c1', port: 'OUT' }, to: { block: 'gt1', port: 'IN1' } },
          { id: 'cn6', from: { block: 'c2', port: 'OUT' }, to: { block: 'gt1', port: 'IN2' } },
          { id: 'cn7', from: { block: 'eq1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } },
          { id: 'cn8', from: { block: 'lt1', port: 'OUT' }, to: { block: 'v2', port: 'IN' } },
          { id: 'cn9', from: { block: 'gt1', port: 'OUT' }, to: { block: 'v3', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('10 = 20');
      expect(result.source).toContain('10 < 20');
      expect(result.source).toContain('10 > 20');
    });
    
    it('should generate NE, LE, GE comparisons', () => {
      const model: FBDModel = {
        name: 'CompareTest2',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'INT', value: 5, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'c2', type: 'constant', dataType: 'INT', value: 5, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'ne1', type: 'NE', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'le1', type: 'LE', position: { x: 100, y: 50 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'ge1', type: 'GE', position: { x: 100, y: 100 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'v1', type: 'variable', variableName: 'A', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v2', type: 'variable', variableName: 'B', position: { x: 200, y: 50 }, inputs: [{ name: 'IN', type: 'BOOL' }] },
          { id: 'v3', type: 'variable', variableName: 'C', position: { x: 200, y: 100 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'ne1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'ne1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'c1', port: 'OUT' }, to: { block: 'le1', port: 'IN1' } },
          { id: 'cn4', from: { block: 'c2', port: 'OUT' }, to: { block: 'le1', port: 'IN2' } },
          { id: 'cn5', from: { block: 'c1', port: 'OUT' }, to: { block: 'ge1', port: 'IN1' } },
          { id: 'cn6', from: { block: 'c2', port: 'OUT' }, to: { block: 'ge1', port: 'IN2' } },
          { id: 'cn7', from: { block: 'ne1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } },
          { id: 'cn8', from: { block: 'le1', port: 'OUT' }, to: { block: 'v2', port: 'IN' } },
          { id: 'cn9', from: { block: 'ge1', port: 'OUT' }, to: { block: 'v3', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('5 <> 5');
      expect(result.source).toContain('5 <= 5');
      expect(result.source).toContain('5 >= 5');
    });
  });
  
  describe('Math Operators', () => {
    it('should generate arithmetic operations', () => {
      const model: FBDModel = {
        name: 'MathTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'INT', value: 10, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'c2', type: 'constant', dataType: 'INT', value: 3, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'add1', type: 'ADD', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'sub1', type: 'SUB', position: { x: 100, y: 50 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'mul1', type: 'MUL', position: { x: 100, y: 100 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'div1', type: 'DIV', position: { x: 100, y: 150 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'mod1', type: 'MOD', position: { x: 100, y: 200 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'v1', type: 'variable', variableName: 'Sum', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'INT' }] },
          { id: 'v2', type: 'variable', variableName: 'Diff', position: { x: 200, y: 50 }, inputs: [{ name: 'IN', type: 'INT' }] },
          { id: 'v3', type: 'variable', variableName: 'Prod', position: { x: 200, y: 100 }, inputs: [{ name: 'IN', type: 'INT' }] },
          { id: 'v4', type: 'variable', variableName: 'Quot', position: { x: 200, y: 150 }, inputs: [{ name: 'IN', type: 'INT' }] },
          { id: 'v5', type: 'variable', variableName: 'Rem', position: { x: 200, y: 200 }, inputs: [{ name: 'IN', type: 'INT' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'add1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'add1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'c1', port: 'OUT' }, to: { block: 'sub1', port: 'IN1' } },
          { id: 'cn4', from: { block: 'c2', port: 'OUT' }, to: { block: 'sub1', port: 'IN2' } },
          { id: 'cn5', from: { block: 'c1', port: 'OUT' }, to: { block: 'mul1', port: 'IN1' } },
          { id: 'cn6', from: { block: 'c2', port: 'OUT' }, to: { block: 'mul1', port: 'IN2' } },
          { id: 'cn7', from: { block: 'c1', port: 'OUT' }, to: { block: 'div1', port: 'IN1' } },
          { id: 'cn8', from: { block: 'c2', port: 'OUT' }, to: { block: 'div1', port: 'IN2' } },
          { id: 'cn9', from: { block: 'c1', port: 'OUT' }, to: { block: 'mod1', port: 'IN1' } },
          { id: 'cn10', from: { block: 'c2', port: 'OUT' }, to: { block: 'mod1', port: 'IN2' } },
          { id: 'cn11', from: { block: 'add1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } },
          { id: 'cn12', from: { block: 'sub1', port: 'OUT' }, to: { block: 'v2', port: 'IN' } },
          { id: 'cn13', from: { block: 'mul1', port: 'OUT' }, to: { block: 'v3', port: 'IN' } },
          { id: 'cn14', from: { block: 'div1', port: 'OUT' }, to: { block: 'v4', port: 'IN' } },
          { id: 'cn15', from: { block: 'mod1', port: 'OUT' }, to: { block: 'v5', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('10 + 3');
      expect(result.source).toContain('10 - 3');
      expect(result.source).toContain('10 * 3');
      expect(result.source).toContain('10 / 3');
      expect(result.source).toContain('10 MOD 3');
    });
    
    it('should generate ABS function', () => {
      const model: FBDModel = {
        name: 'AbsTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'INT', value: -42, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'abs1', type: 'ABS', position: { x: 100, y: 0 }, inputs: [{ name: 'IN', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'v1', type: 'variable', variableName: 'AbsValue', position: { x: 200, y: 0 }, inputs: [{ name: 'IN', type: 'INT' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'abs1', port: 'IN' } },
          { id: 'cn2', from: { block: 'abs1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('ABS(-42)');
    });
  });
  
  describe('Topological Sort', () => {
    it('should execute blocks in dependency order', () => {
      // A chain: const -> add -> mul -> output
      // Must execute in that order
      const model: FBDModel = {
        name: 'ChainTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'c1', type: 'constant', dataType: 'INT', value: 2, position: { x: 0, y: 0 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'c2', type: 'constant', dataType: 'INT', value: 3, position: { x: 0, y: 50 }, outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'add1', type: 'ADD', position: { x: 100, y: 25 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'mul1', type: 'MUL', position: { x: 200, y: 25 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
          { id: 'v1', type: 'variable', variableName: 'Result', position: { x: 300, y: 25 }, inputs: [{ name: 'IN', type: 'INT' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'c1', port: 'OUT' }, to: { block: 'add1', port: 'IN1' } },
          { id: 'cn2', from: { block: 'c2', port: 'OUT' }, to: { block: 'add1', port: 'IN2' } },
          { id: 'cn3', from: { block: 'add1', port: 'OUT' }, to: { block: 'mul1', port: 'IN1' } },
          { id: 'cn4', from: { block: 'c1', port: 'OUT' }, to: { block: 'mul1', port: 'IN2' } },
          { id: 'cn5', from: { block: 'mul1', port: 'OUT' }, to: { block: 'v1', port: 'IN' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      // ADD should appear before MUL in the output
      const addIndex = result.source.indexOf('2 + 3');
      const mulIndex = result.source.indexOf('* 2');
      expect(addIndex).toBeLessThan(mulIndex);
    });
    
    it('should detect circular dependencies', () => {
      // Create a circular dependency: A -> B -> A
      const model: FBDModel = {
        name: 'CircularTest',
        variables: { local: [], outputs: [] },
        blocks: [
          { id: 'a', type: 'AND', position: { x: 0, y: 0 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
          { id: 'b', type: 'OR', position: { x: 100, y: 0 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] }
        ],
        connections: [
          { id: 'cn1', from: { block: 'a', port: 'OUT' }, to: { block: 'b', port: 'IN1' } },
          { id: 'cn2', from: { block: 'b', port: 'OUT' }, to: { block: 'a', port: 'IN1' } }
        ]
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Circular');
    });
  });
  
  describe('Value Formatting', () => {
    it('should format TIME values correctly', () => {
      const model: FBDModel = {
        name: 'TimeTest',
        variables: {
          local: [{ name: 'Delay', type: 'TIME', initialValue: 'T#2s500ms' }],
          outputs: []
        },
        blocks: [],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Delay : TIME := T#2s500ms;');
    });
    
    it('should format REAL values with decimal point', () => {
      const model: FBDModel = {
        name: 'RealTest',
        variables: {
          local: [
            { name: 'Pi', type: 'REAL', initialValue: 3.14159 },
            { name: 'WholeNumber', type: 'REAL', initialValue: 100 }
          ],
          outputs: []
        },
        blocks: [],
        connections: []
      };
      
      const result = transpileFBDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Pi : REAL := 3.14159;');
      expect(result.source).toContain('WholeNumber : REAL := 100.0;');
    });
  });
});

// =============================================================================
// LD Transpiler Tests
// =============================================================================

describe('LD to ST Transpiler', () => {
  
  describe('Basic Structure', () => {
    it('should generate PROGRAM header and END_PROGRAM', () => {
      const model: LDModel = {
        name: 'LadderTest',
        variables: { local: [], outputs: [] },
        rungs: []
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('PROGRAM LadderTest');
      expect(result.source).toContain('END_PROGRAM');
    });
    
    it('should declare local variables', () => {
      const model: LDModel = {
        name: 'VarTest',
        variables: {
          local: [
            { name: 'Flag', type: 'BOOL', initialValue: false },
            { name: 'Counter', type: 'INT', initialValue: 0 }
          ],
          outputs: []
        },
        rungs: []
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Flag : BOOL := FALSE;');
      expect(result.source).toContain('Counter : INT := 0;');
    });
  });
  
  describe('Contact Logic', () => {
    it('should generate NO contact as variable reference', () => {
      const model: LDModel = {
        name: 'ContactTest',
        variables: {
          local: [{ name: 'Switch', type: 'BOOL' }],
          outputs: [{ name: 'Motor', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Switch', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil', variable: 'Motor', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('_rung1_result := Switch;');
      expect(result.source).toContain('Motor := _rung1_result;');
    });
    
    it('should generate NC contact as NOT variable', () => {
      const model: LDModel = {
        name: 'NCContactTest',
        variables: {
          local: [{ name: 'Stop', type: 'BOOL' }],
          outputs: [{ name: 'Running', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_nc', variable: 'Stop', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil', variable: 'Running', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('NOT Stop');
    });
    
    it('should chain multiple contacts with AND', () => {
      const model: LDModel = {
        name: 'ChainTest',
        variables: {
          local: [
            { name: 'Start', type: 'BOOL' },
            { name: 'Safety', type: 'BOOL' }
          ],
          outputs: [{ name: 'Run', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Start', position: { x: 50, y: 0 } },
              { id: 'c2', type: 'contact_no', variable: 'Safety', position: { x: 100, y: 0 } },
              { id: 'o1', type: 'coil', variable: 'Run', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Start AND Safety');
    });
  });
  
  describe('Coil Types', () => {
    it('should generate standard coil assignment', () => {
      const model: LDModel = {
        name: 'CoilTest',
        variables: {
          local: [{ name: 'Input', type: 'BOOL' }],
          outputs: [{ name: 'Output', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Input', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil', variable: 'Output', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('Output := _rung1_result;');
    });
    
    it('should generate negated coil', () => {
      const model: LDModel = {
        name: 'NegCoilTest',
        variables: {
          local: [{ name: 'In', type: 'BOOL' }],
          outputs: [{ name: 'NotOut', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'In', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil_negated', variable: 'NotOut', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('NotOut := NOT _rung1_result;');
    });
    
    it('should generate set/latch coil', () => {
      const model: LDModel = {
        name: 'SetCoilTest',
        variables: {
          local: [{ name: 'Trigger', type: 'BOOL' }],
          outputs: [{ name: 'Latched', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Trigger', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil_set', variable: 'Latched', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('IF _rung1_result THEN Latched := TRUE; END_IF;');
    });
    
    it('should generate reset/unlatch coil', () => {
      const model: LDModel = {
        name: 'ResetCoilTest',
        variables: {
          local: [{ name: 'Clear', type: 'BOOL' }],
          outputs: [{ name: 'Flag', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Clear', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil_reset', variable: 'Flag', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('IF _rung1_result THEN Flag := FALSE; END_IF;');
    });
  });
  
  describe('Function Blocks in Rungs', () => {
    it('should generate timer FB call with inputs', () => {
      const model: LDModel = {
        name: 'TimerLDTest',
        variables: {
          local: [
            { name: 'Start', type: 'BOOL' },
            { name: 'DelayTimer', type: 'TON' }
          ],
          outputs: [{ name: 'Done', type: 'BOOL' }]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'Start', position: { x: 50, y: 0 } },
              { 
                id: 'fb1', 
                type: 'function_block', 
                fbType: 'TON',
                instance: 'DelayTimer',
                parameters: { IN: 'CONNECTED', PT: 'T#5s' },
                outputs: { Q: 'Done' },
                position: { x: 150, y: 0 } 
              }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('DelayTimer(IN := _rung1_result, PT := T#5s);');
      expect(result.source).toContain('Done := DelayTimer.Q;');
    });
  });
  
  describe('Multiple Rungs', () => {
    it('should generate code for multiple rungs with comments', () => {
      const model: LDModel = {
        name: 'MultiRungTest',
        variables: {
          local: [
            { name: 'A', type: 'BOOL' },
            { name: 'B', type: 'BOOL' }
          ],
          outputs: [
            { name: 'X', type: 'BOOL' },
            { name: 'Y', type: 'BOOL' }
          ]
        },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            comment: 'First rung - direct logic',
            elements: [
              { id: 'c1', type: 'contact_no', variable: 'A', position: { x: 50, y: 0 } },
              { id: 'o1', type: 'coil', variable: 'X', position: { x: 200, y: 0 } }
            ],
            connections: []
          },
          {
            id: 'rung2',
            number: 2,
            comment: 'Second rung - inverted logic',
            elements: [
              { id: 'c2', type: 'contact_nc', variable: 'B', position: { x: 50, y: 0 } },
              { id: 'o2', type: 'coil', variable: 'Y', position: { x: 200, y: 0 } }
            ],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('(* Rung 1: First rung - direct logic *)');
      expect(result.source).toContain('(* Rung 2: Second rung - inverted logic *)');
      expect(result.source).toContain('_rung1_result := A;');
      expect(result.source).toContain('_rung2_result := NOT B;');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle empty rungs gracefully', () => {
      const model: LDModel = {
        name: 'EmptyRungTest',
        variables: { local: [], outputs: [] },
        rungs: [
          {
            id: 'rung1',
            number: 1,
            elements: [],
            connections: []
          }
        ]
      };
      
      const result = transpileLDToST(model);
      
      expect(result.success).toBe(true);
      // Should generate rung result but with TRUE (no contacts)
      expect(result.source).toContain('_rung1_result := TRUE;');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

import { compileST } from '../compiler';
import { assemble } from '../assembler';

describe('Transpiler Integration', () => {
  it('should generate compilable ST from blinky.fbd.json example', () => {
    // Load the example file
    const blinkyFBD: FBDModel = {
      name: 'Blinky',
      variables: {
        local: [{ name: 'LedState', type: 'BOOL', initialValue: false }],
        outputs: [{ name: 'LED_Output', type: 'BOOL', address: '%Q0.0' }]
      },
      blocks: [
        { id: 'const_true', type: 'constant', dataType: 'BOOL', value: true, position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'const_500ms', type: 'constant', dataType: 'TIME', value: 'T#500ms', position: { x: 50, y: 120 }, outputs: [{ name: 'OUT', type: 'TIME' }] },
        { id: 'ton_timer', type: 'TON', instanceName: 'BlinkTimer', position: { x: 200, y: 50 },
          inputs: [{ name: 'IN', type: 'BOOL' }, { name: 'PT', type: 'TIME' }],
          outputs: [{ name: 'Q', type: 'BOOL' }, { name: 'ET', type: 'TIME' }]
        }
      ],
      connections: [
        { id: 'conn_1', from: { block: 'const_true', port: 'OUT' }, to: { block: 'ton_timer', port: 'IN' } },
        { id: 'conn_2', from: { block: 'const_500ms', port: 'OUT' }, to: { block: 'ton_timer', port: 'PT' } }
      ]
    };
    
    const result = transpileFBDToST(blinkyFBD);
    
    expect(result.success).toBe(true);
    expect(result.source).toContain('PROGRAM Blinky');
    expect(result.source).toContain('BlinkTimer : TON;');
    expect(result.source).toContain('BlinkTimer(IN := TRUE, PT := T#500ms);');
    expect(result.source).toContain('END_PROGRAM');
  });
});

// =============================================================================
// End-to-End Compilation Tests
// =============================================================================

describe('FBD → ST → Assembly → Bytecode Pipeline', () => {
  
  it('should compile simple FBD with logic gates to bytecode', () => {
    // Simple AND gate: A AND B -> Result
    const model: FBDModel = {
      name: 'LogicGateTest',
      variables: {
        local: [
          { name: 'InputA', type: 'BOOL', initialValue: true },
          { name: 'InputB', type: 'BOOL', initialValue: true },
          { name: 'Result', type: 'BOOL', initialValue: false }
        ],
        outputs: []
      },
      blocks: [
        { id: 'inA', type: 'input', variableName: 'InputA', position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'inB', type: 'input', variableName: 'InputB', position: { x: 50, y: 100 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'and1', type: 'AND', position: { x: 150, y: 75 }, inputs: [{ name: 'IN1', type: 'BOOL' }, { name: 'IN2', type: 'BOOL' }], outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'outR', type: 'output', variableName: 'Result', position: { x: 250, y: 75 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
      ],
      connections: [
        { id: 'c1', from: { block: 'inA', port: 'OUT' }, to: { block: 'and1', port: 'IN1' } },
        { id: 'c2', from: { block: 'inB', port: 'OUT' }, to: { block: 'and1', port: 'IN2' } },
        { id: 'c3', from: { block: 'and1', port: 'OUT' }, to: { block: 'outR', port: 'IN' } }
      ]
    };
    
    // Step 1: Transpile FBD to ST
    const transpileResult = transpileFBDToST(model);
    expect(transpileResult.success).toBe(true);
    expect(transpileResult.source).toContain('PROGRAM LogicGateTest');
    
    // Step 2: Compile ST to assembly
    const assembly = compileST(transpileResult.source);
    expect(assembly).toContain('_start:');
    expect(assembly).toContain('AND');
    
    // Step 3: Assemble to bytecode
    const bytecodeResult = assemble(assembly);
    expect(bytecodeResult.bytecode.length).toBeGreaterThan(0);
    expect(bytecodeResult.codeSize).toBeGreaterThan(0);
  });
  
  it('should compile FBD with TON timer to bytecode', () => {
    const model: FBDModel = {
      name: 'TimerProgram',
      variables: {
        local: [
          { name: 'Enabled', type: 'BOOL', initialValue: true },
          { name: 'Delay', type: 'TIME', initialValue: 'T#1s' },
          { name: 'Done', type: 'BOOL', initialValue: false }
        ],
        outputs: []
      },
      blocks: [
        { id: 'en', type: 'input', variableName: 'Enabled', position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'BOOL' }] },
        { id: 'pt', type: 'input', variableName: 'Delay', position: { x: 50, y: 100 }, outputs: [{ name: 'OUT', type: 'TIME' }] },
        { id: 'timer', type: 'TON', instanceName: 'MyTimer', position: { x: 150, y: 75 },
          inputs: [{ name: 'IN', type: 'BOOL' }, { name: 'PT', type: 'TIME' }],
          outputs: [{ name: 'Q', type: 'BOOL' }, { name: 'ET', type: 'TIME' }]
        },
        { id: 'out', type: 'output', variableName: 'Done', position: { x: 250, y: 75 }, inputs: [{ name: 'IN', type: 'BOOL' }] }
      ],
      connections: [
        { id: 'c1', from: { block: 'en', port: 'OUT' }, to: { block: 'timer', port: 'IN' } },
        { id: 'c2', from: { block: 'pt', port: 'OUT' }, to: { block: 'timer', port: 'PT' } },
        // Note: Timer Q output needs to connect to 'out' - but our transpiler handles FB outputs differently
      ]
    };
    
    // Step 1: Transpile
    const transpileResult = transpileFBDToST(model);
    expect(transpileResult.success).toBe(true);
    expect(transpileResult.source).toContain('MyTimer : TON;');
    expect(transpileResult.source).toContain('MyTimer(');
    
    // Step 2: Compile
    const assembly = compileST(transpileResult.source);
    expect(assembly).toContain('TON Timer Logic');
    
    // Step 3: Assemble
    const bytecodeResult = assemble(assembly);
    expect(bytecodeResult.bytecode.length).toBeGreaterThan(0);
  });
  
  it('should compile FBD with math operators to bytecode', () => {
    const model: FBDModel = {
      name: 'MathProgram',
      variables: {
        local: [
          { name: 'A', type: 'INT', initialValue: 10 },
          { name: 'B', type: 'INT', initialValue: 5 },
          { name: 'Sum', type: 'INT', initialValue: 0 }
        ],
        outputs: []
      },
      blocks: [
        { id: 'inA', type: 'input', variableName: 'A', position: { x: 50, y: 50 }, outputs: [{ name: 'OUT', type: 'INT' }] },
        { id: 'inB', type: 'input', variableName: 'B', position: { x: 50, y: 100 }, outputs: [{ name: 'OUT', type: 'INT' }] },
        { id: 'add', type: 'ADD', position: { x: 150, y: 75 }, inputs: [{ name: 'IN1', type: 'INT' }, { name: 'IN2', type: 'INT' }], outputs: [{ name: 'OUT', type: 'INT' }] },
        { id: 'out', type: 'output', variableName: 'Sum', position: { x: 250, y: 75 }, inputs: [{ name: 'IN', type: 'INT' }] }
      ],
      connections: [
        { id: 'c1', from: { block: 'inA', port: 'OUT' }, to: { block: 'add', port: 'IN1' } },
        { id: 'c2', from: { block: 'inB', port: 'OUT' }, to: { block: 'add', port: 'IN2' } },
        { id: 'c3', from: { block: 'add', port: 'OUT' }, to: { block: 'out', port: 'IN' } }
      ]
    };
    
    // Full pipeline
    const transpileResult = transpileFBDToST(model);
    expect(transpileResult.success).toBe(true);
    
    const assembly = compileST(transpileResult.source);
    expect(assembly).toContain('ADD');
    
    const bytecodeResult = assemble(assembly);
    expect(bytecodeResult.bytecode.length).toBeGreaterThan(0);
  });
});

describe('LD → ST → Assembly → Bytecode Pipeline', () => {
  
  it('should compile simple LD rung with NO contact to bytecode', () => {
    const model: LDModel = {
      name: 'SimpleLadder',
      variables: {
        local: [
          { name: 'Start', type: 'BOOL', initialValue: false },
          { name: 'Motor', type: 'BOOL', initialValue: false }
        ],
        outputs: []
      },
      rungs: [
        {
          id: 'rung1',
          number: 1,
          comment: 'Start button controls motor',
          elements: [
            { id: 'c1', type: 'contact_no', variable: 'Start', position: { x: 50, y: 0 } },
            { id: 'o1', type: 'coil', variable: 'Motor', position: { x: 200, y: 0 } }
          ],
          connections: []
        }
      ]
    };
    
    // Full pipeline
    const transpileResult = transpileLDToST(model);
    expect(transpileResult.success).toBe(true);
    expect(transpileResult.source).toContain('Motor := _rung1_result;');
    
    const assembly = compileST(transpileResult.source);
    expect(assembly).toContain('_start:');
    
    const bytecodeResult = assemble(assembly);
    expect(bytecodeResult.bytecode.length).toBeGreaterThan(0);
  });
  
  it('should compile LD with multiple rungs to bytecode', () => {
    const model: LDModel = {
      name: 'MultiRungLadder',
      variables: {
        local: [
          { name: 'Input1', type: 'BOOL', initialValue: false },
          { name: 'Input2', type: 'BOOL', initialValue: false },
          { name: 'Output1', type: 'BOOL', initialValue: false },
          { name: 'Output2', type: 'BOOL', initialValue: false }
        ],
        outputs: []
      },
      rungs: [
        {
          id: 'rung1',
          number: 1,
          elements: [
            { id: 'c1', type: 'contact_no', variable: 'Input1', position: { x: 50, y: 0 } },
            { id: 'o1', type: 'coil', variable: 'Output1', position: { x: 200, y: 0 } }
          ],
          connections: []
        },
        {
          id: 'rung2',
          number: 2,
          elements: [
            { id: 'c2', type: 'contact_nc', variable: 'Input2', position: { x: 50, y: 0 } },
            { id: 'o2', type: 'coil_negated', variable: 'Output2', position: { x: 200, y: 0 } }
          ],
          connections: []
        }
      ]
    };
    
    // Full pipeline
    const transpileResult = transpileLDToST(model);
    expect(transpileResult.success).toBe(true);
    
    const assembly = compileST(transpileResult.source);
    expect(assembly).toContain('STORE8');
    
    const bytecodeResult = assemble(assembly);
    expect(bytecodeResult.bytecode.length).toBeGreaterThan(0);
    expect(bytecodeResult.codeSize).toBeGreaterThan(10); // Should have substantial code
  });
});

// =============================================================================
// SFC Transpiler Tests
// =============================================================================

import { transpileSFCToST } from './sfcToST';
import type { SFCModel } from '../models/sfc';

describe('SFC to ST Transpiler', () => {
  
  describe('Basic Structure', () => {
    it('should generate PROGRAM header and END_PROGRAM', () => {
      const model: SFCModel = {
        name: 'TestSFC',
        steps: [
          { id: 'step1', name: 'Init', isInitial: true, position: { x: 100, y: 100 } }
        ],
        transitions: []
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('PROGRAM TestSFC');
      expect(result.source).toContain('END_PROGRAM');
    });
    
    it('should generate step active flags', () => {
      const model: SFCModel = {
        name: 'StepTest',
        steps: [
          { id: 'step_init', name: 'Init', isInitial: true, position: { x: 100, y: 100 } },
          { id: 'step_run', name: 'Running', isInitial: false, position: { x: 100, y: 200 } }
        ],
        transitions: []
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('X_step_init : BOOL := TRUE');
      expect(result.source).toContain('X_step_run : BOOL := FALSE');
    });
    
    it('should generate step timers', () => {
      const model: SFCModel = {
        name: 'TimerTest',
        steps: [
          { id: 'step1', name: 'Step1', isInitial: true, position: { x: 100, y: 100 } }
        ],
        transitions: []
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('T_step1 : TON');
      expect(result.source).toContain('T_step1(IN := X_step1');
    });
  });
  
  describe('Transitions', () => {
    it('should generate transition logic', () => {
      const model: SFCModel = {
        name: 'TransitionTest',
        steps: [
          { id: 'step1', name: 'Step1', isInitial: true, position: { x: 100, y: 100 } },
          { id: 'step2', name: 'Step2', isInitial: false, position: { x: 100, y: 200 } }
        ],
        transitions: [
          { id: 't1', fromStep: 'step1', toStep: 'step2', condition: 'TRUE' }
        ]
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('IF X_step1 AND (TRUE) THEN');
      expect(result.source).toContain('X_step1 := FALSE');
      expect(result.source).toContain('X_step2 := TRUE');
    });
  });
  
  describe('Actions', () => {
    it('should generate action execution code', () => {
      const model: SFCModel = {
        name: 'ActionTest',
        steps: [
          {
            id: 'step1',
            name: 'Step1',
            isInitial: true,
            position: { x: 100, y: 100 },
            actions: [{ qualifier: 'N', actionName: 'TurnOnLED' }]
          }
        ],
        transitions: [],
        actions: [
          { id: 'TurnOnLED', name: 'TurnOnLED', type: 'ST', body: 'LED := TRUE;' }
        ]
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('IF X_step1 THEN');
      expect(result.source).toContain('LED := TRUE;');
    });
  });
  
  describe('Complete Blinky SFC', () => {
    it('should transpile blinky SFC model', () => {
      const model: SFCModel = {
        name: 'Blinky',
        variables: {
          local: [
            { name: 'LedState', type: 'BOOL', initialValue: false }
          ],
          outputs: [
            { name: 'LED_Output', type: 'BOOL', address: '%Q0.0' }
          ]
        },
        steps: [
          {
            id: 'step_init',
            name: 'Init',
            isInitial: true,
            position: { x: 200, y: 50 },
            actions: [{ qualifier: 'N', actionName: 'LED_OFF' }]
          },
          {
            id: 'step_led_on',
            name: 'LED_ON',
            isInitial: false,
            position: { x: 200, y: 200 },
            actions: [{ qualifier: 'N', actionName: 'SET_LED_ON' }]
          },
          {
            id: 'step_led_off',
            name: 'LED_OFF',
            isInitial: false,
            position: { x: 200, y: 350 },
            actions: [{ qualifier: 'N', actionName: 'SET_LED_OFF' }]
          }
        ],
        transitions: [
          { id: 't1', fromStep: 'step_init', toStep: 'step_led_on', condition: 'TRUE' },
          { id: 't2', fromStep: 'step_led_on', toStep: 'step_led_off', condition: 'step_led_on.T >= T#500ms' },
          { id: 't3', fromStep: 'step_led_off', toStep: 'step_led_on', condition: 'step_led_off.T >= T#500ms' }
        ],
        actions: [
          { id: 'LED_OFF', name: 'LED_OFF', type: 'ST', body: 'LedState := FALSE;\nLED_Output := FALSE;' },
          { id: 'SET_LED_ON', name: 'SET_LED_ON', type: 'ST', body: 'LedState := TRUE;\nLED_Output := TRUE;' },
          { id: 'SET_LED_OFF', name: 'SET_LED_OFF', type: 'ST', body: 'LedState := FALSE;\nLED_Output := FALSE;' }
        ]
      };
      
      const result = transpileSFCToST(model);
      
      expect(result.success).toBe(true);
      expect(result.source).toContain('PROGRAM Blinky');
      expect(result.source).toContain('X_step_init : BOOL := TRUE');
      expect(result.source).toContain('LedState : BOOL := FALSE');
      expect(result.source).toContain('LED_Output AT %Q0.0 : BOOL');
      // Check timer condition is transformed
      expect(result.source).toContain('T_step_led_on.ET >= T#500ms');
    });
  });
});
