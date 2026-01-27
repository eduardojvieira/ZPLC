import { HILTestCase } from '../../src/runner';

export const logicTests: HILTestCase[] = [
  {
    id: 'opcodes.logic.and',
    name: 'OP_AND: Bitwise AND',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : WORD := 16#0F0F;
        b : WORD := 16#FFFF;
        res : WORD;
      END_VAR
      res := a AND b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"AND",.*"tos":3855\}/ // 16#0F0F = 3855
      }
    ]
  },
  {
    id: 'opcodes.logic.eq',
    name: 'OP_EQ: Equality Comparison',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 10;
        b : INT := 10;
        res : BOOL;
      END_VAR
      res := (a = b);
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"EQ",.*"tos":1\}/
      }
    ]
  }
];
