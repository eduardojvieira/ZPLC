import type { HILTestCase } from '../../src/runner';
import { describeCases } from '../cases';

export const memoryTests: HILTestCase[] = [
  {
    id: 'opcodes.memory.load_store',
    name: 'OP_LOAD/STORE: Basic Memory Access',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 42;
        b : INT;
      END_VAR
      b := a;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"LOAD16",.*\}/
      },
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"STORE16",.*\}/
      }
    ]
  },
  {
    id: 'opcodes.memory.out_of_bounds',
    name: 'OP_LOAD: Out of Bounds Access',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        values : ARRAY[0..3] OF INT;
        index : INT := 1000;
        res : INT;
      END_VAR
      (* an index far outside the array reads outside the program's memory *)
      res := values[index];
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'error',
        code: 5 // OUT_OF_BOUNDS
      }
    ]
  }
];

describeCases('HIL cases: memory opcodes (HIL-001)', memoryTests);
