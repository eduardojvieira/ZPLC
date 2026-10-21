import type { HILTestCase } from '../../src/runner';
import { describeCases } from '../cases';

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
        i : INT := 0;
      END_VAR
      (* a loop jumps back to its test: the unconditional jump of the VM *)
      WHILE i < 3 DO
        i := i + 1;
      END_WHILE;
      res := i;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"JMP",.*\}/,
      },
    ],
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
        pattern: /\{"t":"opcode","op":"JNZ",.*\}/,
      },
    ],
  },
];

describeCases('HIL cases: control-flow opcodes (HIL-001)', controlTests);
