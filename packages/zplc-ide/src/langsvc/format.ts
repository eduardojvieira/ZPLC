/**
 * Document formatting of Structured Text (LNG-016).
 *
 * It changes only the white space at the start and at the end of a line: each line is indented by the depth of the
 * blocks it is in, and a line that continues an expression is indented one more. Nothing else is touched: no line is
 * added or removed (a breakpoint is a line number), no token is moved, a comment and a string are left as written.
 * The depth comes from the tokens of the compiler's lexer, so the result is deterministic, and formatting it again
 * changes nothing (idempotent).
 */

import { tokenizeWithErrors, TokenType, type Token } from '@zplc/compiler';

export interface FormatOptions {
  /** Spaces for one level of indentation; 2 when absent. */
  indentSize?: number;
}

export interface LineEdit {
  /** 1-based line. */
  line: number;
  /** The whole line, as it should be. */
  text: string;
}

const OPENERS: ReadonlySet<string> = new Set([
  TokenType.PROGRAM,
  TokenType.FUNCTION,
  TokenType.FUNCTION_BLOCK,
  TokenType.INTERFACE,
  TokenType.METHOD,
  TokenType.TYPE,
  TokenType.VAR,
  TokenType.VAR_INPUT,
  TokenType.VAR_OUTPUT,
  TokenType.VAR_IN_OUT,
  TokenType.VAR_TEMP,
  TokenType.VAR_GLOBAL,
  TokenType.VAR_EXTERNAL,
  TokenType.IF,
  TokenType.CASE,
  TokenType.FOR,
  TokenType.WHILE,
  TokenType.REPEAT,
]);
const CLOSERS: ReadonlySet<string> = new Set([
  TokenType.END_PROGRAM,
  TokenType.END_FUNCTION,
  TokenType.END_FUNCTION_BLOCK,
  TokenType.END_INTERFACE,
  TokenType.END_METHOD,
  TokenType.END_TYPE,
  TokenType.END_VAR,
  TokenType.END_IF,
  TokenType.END_CASE,
  TokenType.END_FOR,
  TokenType.END_WHILE,
  TokenType.END_REPEAT,
]);
/** A line that ends with one of these has not ended its statement: the next line continues it. */
const CONTINUES: ReadonlySet<string> = new Set([
  TokenType.AND,
  TokenType.OR,
  TokenType.XOR,
  TokenType.NOT,
  TokenType.MOD,
  TokenType.PLUS,
  TokenType.MINUS,
  TokenType.STAR,
  TokenType.SLASH,
  TokenType.POWER,
  TokenType.ASSIGN,
  TokenType.OUTPUT_ASSIGN,
  TokenType.EQ,
  TokenType.NE,
  TokenType.LT,
  TokenType.LE,
  TokenType.GT,
  TokenType.GE,
  TokenType.COMMA,
]);
/** Tokens that, at the start of a line, are written one level out: they belong to the block that continues. */
const BRANCHES: ReadonlySet<string> = new Set([TokenType.ELSE, TokenType.ELSIF, TokenType.UNTIL]);

/**
 * For each line: its text with comments replaced by spaces (same length), and whether it begins inside a block
 * comment that an earlier line opened.
 */
function scanLines(text: string): Array<{ code: string; inComment: boolean }> {
  const lines: Array<{ code: string; inComment: boolean }> = [];
  let block = false;
  for (const raw of text.split('\n')) {
    const inComment = block;
    let code = '';
    let quote: string | null = null;
    for (let at = 0; at < raw.length; at++) {
      const char = raw[at]!;
      const next = raw[at + 1];
      if (block) {
        if (char === '*' && next === ')') {
          block = false;
          code += '  ';
          at++;
        } else code += ' ';
        continue;
      }
      if (quote) {
        code += char;
        if (char === quote) quote = null;
        continue;
      }
      if (char === '(' && next === '*') {
        block = true;
        code += '  ';
        at++;
        continue;
      }
      if (char === '/' && next === '/') {
        code += ' '.repeat(raw.length - at);
        break;
      }
      if (char === "'" || char === '"') quote = char;
      code += char;
    }
    lines.push({ code, inComment });
  }
  return lines;
}

/**
 * The lines of `text` that formatting changes, and what they become. The lexer must read the source: one it cannot
 * read (an unterminated string, a character that is no token) is not formatted.
 */
export function formatEdits(text: string, options: FormatOptions = {}): LineEdit[] {
  const size = Math.max(1, Math.min(8, Math.trunc(options.indentSize ?? 2)));
  const lexed = tokenizeWithErrors(text);
  if (lexed.errors.length > 0) return [];

  const rows = text.split('\n');
  const scanned = scanLines(text);
  const byLine = new Map<number, Token[]>();
  for (const token of lexed.tokens) {
    if (token.type === TokenType.EOF) continue;
    const list = byLine.get(token.line);
    if (list) list.push(token);
    else byLine.set(token.line, [token]);
  }

  const edits: LineEdit[] = [];
  let depth = 0;
  let parens = 0;
  let continues = false;
  /** The CASE statements that are open: the depth of the CASE, and whether the label above has no statement after it. */
  const cases: Array<{ depth: number; open: boolean }> = [];

  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index]!.replace(/\r$/, '');
    const trimmed = raw.replace(/[ \t]+$/, '');
    const tokens = byLine.get(index + 1) ?? [];
    let target: string;

    if (trimmed.trim() === '') {
      target = '';
    } else if (scanned[index]!.inComment) {
      // the text of a block comment that began on an earlier line is the author's
      target = trimmed;
    } else {
      const first = tokens[0];
      let level = depth;
      const body = cases[cases.length - 1];
      const inCaseBody = body !== undefined && depth === body.depth + 1;
      if (first && (CLOSERS.has(first.type) || BRANCHES.has(first.type)) && !(inCaseBody && first.type === TokenType.ELSE)) level -= 1;
      if (first && inCaseBody && !CLOSERS.has(first.type)) {
        const colon = tokens.findIndex((token) => token.type === TokenType.COLON);
        const assign = tokens.findIndex((token) => token.type === TokenType.ASSIGN);
        if (first.type === TokenType.ELSE) body.open = true;
        else if (colon >= 0 && (assign < 0 || colon < assign)) body.open = colon === tokens.length - 1;
        else if (body.open) level += 1;
      }
      if (first && (parens > 0 || continues) && !CLOSERS.has(first.type) && !BRANCHES.has(first.type)) level += 1;
      target = ' '.repeat(Math.max(0, level) * size) + trimmed.trimStart();
    }
    if (target !== raw) edits.push({ line: index + 1, text: target });

    if (tokens.length > 0) continues = CONTINUES.has(tokens[tokens.length - 1]!.type);
    // what this line does to the depth of the lines after it
    for (const token of tokens) {
      if (token.type === TokenType.LPAREN || token.type === TokenType.LBRACKET) parens++;
      else if (token.type === TokenType.RPAREN || token.type === TokenType.RBRACKET) parens = Math.max(0, parens - 1);
      else if (CLOSERS.has(token.type)) {
        if (token.type === TokenType.END_CASE) cases.pop();
        depth = Math.max(0, depth - 1);
      } else if (OPENERS.has(token.type)) {
        if (token.type === TokenType.CASE) cases.push({ depth, open: false });
        depth++;
      }
    }
  }
  return edits;
}

/** `text` formatted. */
export function formatSource(text: string, options: FormatOptions = {}): string {
  const rows = text.split('\n');
  for (const edit of formatEdits(text, options)) {
    const row = rows[edit.line - 1]!;
    rows[edit.line - 1] = edit.text + (row.endsWith('\r') ? '\r' : '');
  }
  return rows.join('\n');
}
