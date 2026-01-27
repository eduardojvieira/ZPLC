import { HILTestCase } from '../../src/runner';

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
        p : POINTER TO INT;
        res : INT;
      END_VAR
      p := 16#FFFF; // Invalid address
      res := p^;
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
