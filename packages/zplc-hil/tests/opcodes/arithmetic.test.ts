import { HILTestCase } from '../../src/runner';

export const arithmeticTests: HILTestCase[] = [
  {
    id: 'opcodes.arithmetic.add',
    name: 'OP_ADD: Basic Integer Addition',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 10;
        b : INT := 20;
        res : INT;
      END_VAR
      res := a + b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"ADD",.*"tos":30\}/
      }
    ]
  },
  {
    id: 'opcodes.arithmetic.sub',
    name: 'OP_SUB: Basic Integer Subtraction',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 100;
        b : INT := 40;
        res : INT;
      END_VAR
      res := a - b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"SUB",.*"tos":60\}/
      }
    ]
  },
  {
    id: 'opcodes.arithmetic.div_zero',
    name: 'OP_DIV: Division by Zero',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 10;
        b : INT := 0;
        res : INT;
      END_VAR
      res := a / b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'error',
        code: 3 // DIV_BY_ZERO
      }
    ]
  },
  {
    id: 'opcodes.arithmetic.mul',
    name: 'OP_MUL: Basic Integer Multiplication',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 6;
        b : INT := 7;
        res : INT;
      END_VAR
      res := a * b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"MUL",.*"tos":42\}/
      }
    ]
  },
  {
    id: 'opcodes.arithmetic.mod',
    name: 'OP_MOD: Integer Modulo',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 17;
        b : INT := 5;
        res : INT;
      END_VAR
      res := a MOD b;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"MOD",.*"tos":2\}/
      }
    ]
  },
  {
    id: 'opcodes.arithmetic.neg',
    name: 'OP_NEG: Integer Negation',
    category: 'opcode',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        a : INT := 42;
        res : INT;
      END_VAR
      res := -a;
      END_PROGRAM
    `,
    debugMode: 'verbose',
    assertions: [
      {
        type: 'pattern',
        pattern: /\{"t":"opcode","op":"NEG",.*"tos":-42\}/
      }
    ]
  }
];
