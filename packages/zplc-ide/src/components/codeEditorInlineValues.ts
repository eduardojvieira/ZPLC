import type { PLCLanguage } from '../types';

export interface InlineValueWidget {
  lineNumber: number;
  column: number;
  variableName: string;
  value: string;
  type: string | null;
  isBool: boolean;
  isTrue?: boolean;
}

interface VariableInstances {
  lines: number[];
  instances: Array<{ line: number; col: number }>;
}

interface VariableValueInfo {
  value: string;
  type: string | null;
  isBool: boolean;
  isTrue?: boolean;
}

const COMMENT_STATE = {
  CODE: 'code',
  LINE_COMMENT: 'line_comment',
  BLOCK_COMMENT: 'block_comment',
  SINGLE_QUOTE_STRING: 'single_quote_string',
  DOUBLE_QUOTE_STRING: 'double_quote_string',
} as const;

type CommentState = (typeof COMMENT_STATE)[keyof typeof COMMENT_STATE];

/**
 * Replace comments with spaces while preserving source length and newlines.
 * This keeps line/column positions stable for Monaco decorations.
 */
export function stripCommentsPreserveLayout(content: string): string {
  let state: CommentState = COMMENT_STATE.CODE;
  let result = '';

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = i + 1 < content.length ? content[i + 1] : '';

    switch (state) {
      case COMMENT_STATE.CODE:
        if (char === '/' && nextChar === '/') {
          result += '  ';
          i++;
          state = COMMENT_STATE.LINE_COMMENT;
          continue;
        }

        if (char === '(' && nextChar === '*') {
          result += '  ';
          i++;
          state = COMMENT_STATE.BLOCK_COMMENT;
          continue;
        }

        if (char === '\'') {
          result += char;
          state = COMMENT_STATE.SINGLE_QUOTE_STRING;
          continue;
        }

        if (char === '"') {
          result += char;
          state = COMMENT_STATE.DOUBLE_QUOTE_STRING;
          continue;
        }

        result += char;
        continue;

      case COMMENT_STATE.LINE_COMMENT:
        if (char === '\n') {
          result += '\n';
          state = COMMENT_STATE.CODE;
        } else {
          result += ' ';
        }
        continue;

      case COMMENT_STATE.BLOCK_COMMENT:
        if (char === '*' && nextChar === ')') {
          result += '  ';
          i++;
          state = COMMENT_STATE.CODE;
        } else if (char === '\n') {
          result += '\n';
        } else {
          result += ' ';
        }
        continue;

      case COMMENT_STATE.SINGLE_QUOTE_STRING:
        result += char;
        if (char === '\'') {
          state = COMMENT_STATE.CODE;
        }
        continue;

      case COMMENT_STATE.DOUBLE_QUOTE_STRING:
        result += char;
        if (char === '"') {
          state = COMMENT_STATE.CODE;
        }
        continue;
    }
  }

  return result;
}

/**
 * Extract all variable references from ST/IL code.
 * Returns variable names and their line positions.
 */
export function extractVariablesFromCode(content: string, _language: PLCLanguage): Map<string, VariableInstances> {
  const variables = new Map<string, VariableInstances>();
  const sanitizedContent = stripCommentsPreserveLayout(content);
  const lines = sanitizedContent.split('\n');

  const keywords = new Set([
    'PROGRAM', 'END_PROGRAM', 'FUNCTION', 'END_FUNCTION', 'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
    'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_GLOBAL', 'END_VAR',
    'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF', 'CASE', 'OF', 'END_CASE',
    'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT',
    'TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'XOR', 'MOD', 'DIV',
    'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD', 'SINT', 'INT', 'DINT', 'LINT',
    'USINT', 'UINT', 'UDINT', 'ULINT', 'REAL', 'LREAL', 'TIME', 'STRING',
    'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD', 'R_TRIG', 'F_TRIG', 'SR', 'RS',
    'AT', 'RETAIN', 'CONSTANT', 'RETURN', 'EXIT',
    'LD', 'LDN', 'ST', 'STN', 'S', 'R',
    'AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN', 'NOT',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'GT', 'GE', 'EQ', 'NE', 'LE', 'LT',
    'JMP', 'JMPC', 'JMPCN', 'CAL', 'CALC', 'CALCN', 'RET', 'RETC', 'RETCN',
  ]);

  const fbInstances = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fbDeclMatch = line.match(/^\s*(\w+)\s*:\s*(TON|TOF|TP|CTU|CTD|CTUD|R_TRIG|F_TRIG|SR|RS)\b/i);
    if (fbDeclMatch) {
      fbInstances.set(fbDeclMatch[1], fbDeclMatch[2].toUpperCase());
    }
  }

  const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\b/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;
    const cleanLine = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    let match: RegExpExecArray | null;
    while ((match = identifierRegex.exec(cleanLine)) !== null) {
      const varName = match[1];
      const baseName = varName.split('.')[0];

      if (keywords.has(baseName.toUpperCase())) continue;
      if (keywords.has(varName.toUpperCase())) continue;

      const beforeMatch = cleanLine.substring(0, match.index);
      if (beforeMatch.match(/:\s*$/)) continue;

      const col = match.index + 1;
      const existing = variables.get(varName) || { lines: [], instances: [] };
      if (!existing.lines.includes(lineNum)) {
        existing.lines.push(lineNum);
      }
      existing.instances.push({ line: lineNum, col });
      variables.set(varName, existing);

      if (fbInstances.has(baseName) && !varName.includes('.')) {
        const fbType = fbInstances.get(baseName)!;
        const outputs: string[] = [];

        switch (fbType) {
          case 'TON':
          case 'TOF':
          case 'TP':
            outputs.push(`${baseName}.Q`, `${baseName}.ET`, `${baseName}.IN`, `${baseName}.PT`);
            break;
          case 'CTU':
            outputs.push(`${baseName}.Q`, `${baseName}.CV`, `${baseName}.CU`, `${baseName}.PV`);
            break;
          case 'CTD':
            outputs.push(`${baseName}.Q`, `${baseName}.CV`, `${baseName}.CD`, `${baseName}.PV`);
            break;
          case 'CTUD':
            outputs.push(`${baseName}.QU`, `${baseName}.QD`, `${baseName}.CV`, `${baseName}.CU`, `${baseName}.CD`, `${baseName}.PV`);
            break;
          case 'R_TRIG':
          case 'F_TRIG':
            outputs.push(`${baseName}.Q`, `${baseName}.CLK`);
            break;
          case 'SR':
          case 'RS':
            outputs.push(`${baseName}.Q1`, `${baseName}.S`, `${baseName}.R1`);
            break;
        }

        for (const output of outputs) {
          if (!variables.has(output)) {
            variables.set(output, { lines: existing.lines.slice(), instances: [] });
          }
        }
      }
    }
  }

  return variables;
}

/**
 * Find the best position to show inline value for each line.
 */
export function buildInlineWidgets(
  content: string,
  variableValues: Map<string, VariableValueInfo>,
): InlineValueWidget[] {
  const widgets: InlineValueWidget[] = [];
  const sanitizedContent = stripCommentsPreserveLayout(content);
  const lines = sanitizedContent.split('\n');
  const shownOnLine = new Map<number, Set<string>>();

  const skipPatterns = [/^\s*$/, /^\s*VAR/, /^\s*END_VAR/, /^\s*PROGRAM/, /^\s*END_PROGRAM/];
  const ilInstructions = new Set([
    'LD', 'LDN', 'ST', 'STN', 'S', 'R',
    'AND', 'ANDN', 'OR', 'ORN', 'XOR', 'XORN', 'NOT',
    'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'GT', 'GE', 'EQ', 'NE', 'LE', 'LT',
    'JMP', 'JMPC', 'JMPCN', 'CAL', 'CALC', 'CALCN', 'RET', 'RETC', 'RETCN',
    'PT', 'IN', 'TRUE', 'FALSE',
  ]);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    if (skipPatterns.some((pattern) => pattern.test(line))) continue;

    const varsOnLine: InlineValueWidget[] = [];
    const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\b/g;
    const cleanLine = line.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    let match: RegExpExecArray | null;
    const seenOnThisLine = new Set<string>();

    while ((match = identifierRegex.exec(cleanLine)) !== null) {
      const varName = match[1];
      if (seenOnThisLine.has(varName)) continue;

      seenOnThisLine.add(varName);
      if (ilInstructions.has(varName.toUpperCase())) continue;

      const valInfo = variableValues.get(varName);
      if (valInfo) {
        varsOnLine.push({
          lineNumber: lineNum,
          column: match.index + 1,
          variableName: varName,
          value: valInfo.value,
          type: valInfo.type,
          isBool: valInfo.isBool,
          isTrue: valInfo.isTrue,
        });
      }
    }

    varsOnLine.sort((a, b) => {
      const aIsFBOutput = a.variableName.includes('.');
      const bIsFBOutput = b.variableName.includes('.');
      if (aIsFBOutput && !bIsFBOutput) return -1;
      if (!aIsFBOutput && bIsFBOutput) return 1;
      return a.column - b.column;
    });

    const lineVarsShown = shownOnLine.get(lineNum) || new Set<string>();
    for (const widget of varsOnLine.slice(0, 4)) {
      if (!lineVarsShown.has(widget.variableName)) {
        widgets.push(widget);
        lineVarsShown.add(widget.variableName);
      }
    }
    shownOnLine.set(lineNum, lineVarsShown);
  }

  return widgets;
}
