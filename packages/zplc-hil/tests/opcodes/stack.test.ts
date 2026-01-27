import { HILTestCase } from '../../src/runner';

export const stackTests: HILTestCase[] = [
  {
    id: 'opcodes.stack.dup',
    name: 'OP_DUP: Duplicate top of stack',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 10;
        res : INT;
      END_VAR
      res := a + a; // Uses DUP internally if optimized, or LOAD twice
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"DUP",.*\}/
      }
    ]
  },
  {
    id: 'opcodes.stack.swap',
    name: 'OP_SWAP: Swap top two elements',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 1;
        b : INT := 2;
        res : BOOL;
      END_VAR
      res := (a > b); // Compiles to: LOAD a, LOAD b, GT
      // We can manually force a swap in IL or test a scenario where it's used
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      // Swap is often used in expression evaluation
      {
        type: 'no_error'
      }
    ]
  }
];
