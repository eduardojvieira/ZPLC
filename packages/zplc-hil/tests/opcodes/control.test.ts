import { HILTestCase } from '../../src/runner';

export const controlTests: HILTestCase[] = [
  {
    id: 'opcodes.control.jmp',
    name: 'OP_JMP: Unconditional Jump',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        res : INT := 0;
      END_VAR
      GOTO Label1;
      res := 1;
      Label1:
      res := 2;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"JMP",.*\}/
      }
    ]
  },
  {
    id: 'opcodes.control.if_else',
    name: 'OP_JZ/JNZ: Conditional Branching',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        cond : BOOL := TRUE;
        res : INT;
      END_VAR
      IF cond THEN
        res := 1;
      ELSE
        res := 2;
      END_IF
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"JNZ",.*\}/
      }
    ]
  }
];
