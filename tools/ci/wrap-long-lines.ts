// Wraps the lines over the limit that can be wrapped without changing what the code does (VF-017).
//
//   bun tools/ci/wrap-long-lines.ts [--write] [files...]    default: the tracked TypeScript and JavaScript files
//
// Prettier never breaks a string literal or re-wraps a comment, so the lines that stay over the limit after it are
// of three kinds, and this script handles the first two:
//   - comments: a `//` comment is re-wrapped (a trailing one moves above its code), a one-line `/** */` becomes a
//     block, and a line of a block comment continues on a ` * ` line;
//   - string literals and templates: cut at a space into `'a ' + 'b'`, the same value, where the expression sits in a
//     position that takes a concatenation (an argument, an initializer, an operand of +, a return, an array element,
//     a branch of ?:). A property name, a module specifier, a type, a tagged template and the object of a member
//     access are never cut;
//   - anything else (a regular expression, a JSX text, a data URL) is left, and tools/ci/line-length-guard.ts
//     reports it for a hand edit.
// `bun run format` runs this script and Prettier until neither changes a file, so the result is a fixed point.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

import { ROOT, formattableFiles } from './format-files';
import { LIMIT } from './line-length-guard';

const CODE_FILE = /\.(?:ts|tsx|js|mjs|cjs)$/;
/** Comments that a tool reads: they stay where and as they are. */
const DIRECTIVE = /eslint|@ts-|prettier-ignore|istanbul|c8 |@vitest|sourceMappingURL|#region|#endregion|SPDX|NOLINT|^\/\/\/|@jsx/;

interface Edit {
  start: number;
  end: number;
  text: string;
}

const width = (text: string) => [...text].length;

/** Greedy word wrap: the lines carry `first` and `next` as prefixes and stay within `limit` columns when a word allows. */
export function wrapWords(words: string[], first: string, next: string, limit: number = LIMIT): string[] {
  const lines: string[] = [];
  let line = first;
  let empty = true;
  for (const word of words) {
    if (!empty && width(line) + 1 + width(word) > limit) {
      lines.push(line);
      line = next;
      empty = true;
    }
    line += (empty ? '' : ' ') + word;
    empty = false;
  }
  lines.push(line);
  return lines;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') starts.push(index + 1);
  return starts;
}

function commentRanges(source: ts.SourceFile): ts.CommentRange[] {
  const found = new Map<number, ts.CommentRange>();
  const text = source.text;
  const visit = (node: ts.Node) => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) found.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) found.set(range.pos, range);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found.values()].sort((a, b) => a.pos - b.pos);
}

/** A segment of text inside quotes or backticks that can take a cut, with the quote that closes and reopens it. */
interface Segment {
  from: number;
  to: number;
  quote: string;
  owner: ts.Node;
}

function stringSegments(source: ts.SourceFile): Segment[] {
  const segments: Segment[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) {
      const quote = source.text[node.getStart(source)]!;
      segments.push({ from: node.getStart(source) + 1, to: node.getEnd() - 1, quote, owner: node });
    } else if (ts.isNoSubstitutionTemplateLiteral(node)) {
      segments.push({ from: node.getStart(source) + 1, to: node.getEnd() - 1, quote: '`', owner: node });
    } else if (ts.isTemplateExpression(node)) {
      const parts: ts.Node[] = [node.head, ...node.templateSpans.map((span) => span.literal)];
      parts.forEach((part, index) => {
        const start = part.getStart(source);
        const end = part.getEnd();
        segments.push({ from: start + 1, to: index === parts.length - 1 ? end - 1 : end - 2, quote: '`', owner: node });
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return segments;
}

/** Whether `node`, written as `a + b`, keeps its value and its type where it stands. */
function takesConcatenation(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isTaggedTemplateExpression(parent)) return false;
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    if (parent.expression === node) return false;
    // a module specifier: require('x'), import('x')
    return !(ts.isCallExpression(parent) && (parent.expression.kind === ts.SyntaxKind.ImportKeyword || parent.expression.getText() === 'require'));
  }
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
    return parent.initializer === node;
  }
  if (ts.isParameter(parent)) return parent.initializer === node;
  if (ts.isConditionalExpression(parent)) return parent.condition !== node;
  if (ts.isBinaryExpression(parent)) {
    return [
      ts.SyntaxKind.PlusToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(parent.operatorToken.kind);
  }
  return (
    ts.isReturnStatement(parent) ||
    ts.isThrowStatement(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    ts.isParenthesizedExpression(parent) ||
    ts.isTemplateSpan(parent) ||
    ts.isCaseClause(parent) ||
    (ts.isArrowFunction(parent) && parent.body === node) ||
    ts.isExportAssignment(parent) ||
    ts.isJsxExpression(parent)
  );
}

/** The offset of the space (or, with none, a safe character) after which a segment can be cut, or -1. */
function cutPoint(text: string, from: number, last: number, owner: ts.Node): number {
  for (let at = last; at > from + 8; at -= 1) {
    if (text[at] === ' ' && text[at - 1] !== '\\' && text[at - 1] !== ' ') return at;
  }
  // a string with no space (base64, a JSON text): cut where no escape sequence is near
  if (!ts.isStringLiteral(owner) && !ts.isNoSubstitutionTemplateLiteral(owner)) return -1;
  if (/\s/.test(text.slice(from, last))) return -1;
  for (let at = last; at > from + 8; at -= 1) {
    if (!text.slice(at - 12, at + 1).includes('\\')) return at;
  }
  return -1;
}

/** Where a comment line wraps: the words of its text, behind the prefix that opens it. */
function wrapCommentLine(line: string): string[] | undefined {
  const line_ = /^(\s*)(\/\/+\s?)(.*)$/.exec(line);
  if (line_) {
    const [, indent, marker, body] = line_ as unknown as [string, string, string, string];
    if (DIRECTIVE.test(line.trim()) || /\S {3,}\S/.test(body) || /^\s/.test(body)) return undefined;
    return wrapWords(body.split(/\s+/).filter(Boolean), indent + marker, indent + marker);
  }
  const inner = /^(\s*\*\s?)(.*)$/.exec(line);
  if (inner && !line.includes('*/')) {
    const [, prefix, body] = inner as unknown as [string, string, string];
    if (DIRECTIVE.test(line.trim()) || /\S {3,}\S/.test(body) || /^\s/.test(body)) return undefined;
    return wrapWords(body.split(/\s+/).filter(Boolean), prefix, prefix);
  }
  return undefined;
}

/** The edits that wrap the over-long lines of one file; the text is edited from the end, so that offsets hold. */
export function wrapText(file: string, text: string, limit: number = LIMIT): string {
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.(?:js|mjs|cjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const starts = lineStarts(text);
  const lines = text.split('\n');
  const comments = commentRanges(source);
  const segments = stringSegments(source);
  const templateSpans: ts.TemplateSpan[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isTemplateSpan(node)) templateSpans.push(node);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const insideTemplate = (offset: number) =>
    segments.some((segment) => segment.quote === '`' && offset > segment.from - 1 && offset < segment.to + 1);
  const edits: Edit[] = [];

  lines.forEach((line, index) => {
    if (width(line) <= limit) return;
    const lineStart = starts[index]!;
    const lineEnd = lineStart + line.length;
    // 1. a comment
    const comment = comments.find((range) => range.pos < lineEnd && range.end > lineStart && !insideTemplate(range.pos));
    if (comment) {
      const indent = /^\s*/.exec(line)![0];
      const startsLine = comment.pos <= lineStart + indent.length && comment.pos >= lineStart;
      if (comment.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
        if (startsLine) {
          const wrapped = wrapCommentLine(line);
          if (wrapped) edits.push({ start: lineStart, end: lineEnd, text: wrapped.join('\n') });
          return;
        }
        const body = text.slice(comment.pos, comment.end);
        const wrapped = DIRECTIVE.test(body) || insideTemplate(lineStart) ? undefined : wrapCommentLine(indent + body);
        if (wrapped) {
          const code = text.slice(lineStart, comment.pos).trimEnd();
          edits.push({ start: lineStart, end: lineEnd, text: `${wrapped.join('\n')}\n${code}` });
        }
        return;
      }
      // a block comment: one line, or a line of several
      if (comment.pos >= lineStart && comment.end <= lineEnd && startsLine) {
        const body = text.slice(comment.pos + 2, comment.end - 2).replace(/^\*/, '').trim();
        if (DIRECTIVE.test(body) || /\S {3,}\S/.test(body)) return;
        const lead = `${indent} * `;
        const wrapped = wrapWords(body.split(/\s+/).filter(Boolean), lead, lead);
        edits.push({ start: lineStart, end: lineEnd, text: [`${indent}/**`, ...wrapped, `${indent} */`].join('\n') });
        return;
      }
      if (comment.pos < lineStart) {
        const wrapped = wrapCommentLine(line);
        if (wrapped) edits.push({ start: lineStart, end: lineEnd, text: wrapped.join('\n') });
        return;
      }
      if (comment.pos <= lineStart + indent.length) {
        // the first line of a multi-line block comment: `/** words` continues on a ` * ` line
        const open = /^(\s*\/\*+\s?)(.*)$/.exec(line);
        if (open && !DIRECTIVE.test(line)) {
          const prefix = open[1]!;
          const words = open[2]!.split(/\s+/).filter(Boolean);
          const wrapped = wrapWords(words, prefix, `${indent} * `);
          edits.push({ start: lineStart, end: lineEnd, text: wrapped.join('\n') });
        }
      }
      return;
    }
    // 2. a string or a template: cut at the last space that leaves the head on the line
    const indent = /^\s*/.exec(line)![0];
    const room = lineStart + limit - 4; // the space kept in the head, the closing quote and ` +`
    const candidates = segments
      .filter((segment) => segment.to > lineStart && segment.from < lineEnd && takesConcatenation(segment.owner))
      .sort((a, b) => b.from - a.from);
    for (const segment of candidates) {
      const from = Math.max(segment.from, lineStart);
      const cut = cutPoint(text, from, Math.min(room, segment.to - 2), segment.owner);
      if (cut < 0) continue;
      edits.push({ start: cut + 1, end: cut + 1, text: `${segment.quote} +\n${indent}  ${segment.quote}` });
      return;
    }
    // 3. a class list or another long attribute string of JSX: `a="x y"` becomes `a={'x ' + 'y'}`
    for (const segment of segments) {
      const owner = segment.owner;
      if (!ts.isStringLiteral(owner) || !ts.isJsxAttribute(owner.parent) || segment.to <= lineStart || segment.from >= lineEnd) continue;
      const content = text.slice(segment.from, segment.to);
      if (/[\\&'"`{}]/.test(content)) continue;
      const cut = cutPoint(text, Math.max(segment.from, lineStart), Math.min(room, segment.to - 2), owner);
      if (cut < 0) continue;
      edits.push({ start: segment.from - 1, end: segment.from - 1, text: '{' });
      edits.push({ start: cut + 1, end: cut + 1, text: `" +\n${indent}  "` });
      edits.push({ start: segment.to + 1, end: segment.to + 1, text: '}' });
      return;
    }
    // 4. an interpolation of a template: a line break after `${` makes Prettier lay the expression out
    const spans = templateSpans
      .filter((span) => span.expression.getStart(source) < lineEnd && span.expression.getEnd() > lineStart)
      .sort((a, b) => b.expression.getEnd() - b.expression.getStart(source) - (a.expression.getEnd() - a.expression.getStart(source)));
    for (const span of spans) {
      const at = span.expression.getStart(source);
      if (text.slice(span.pos, at).includes('\n') || at < lineStart || at >= lineStart + limit) continue;
      edits.push({ start: at, end: at, text: '\n' });
      return;
    }
  });

  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** Wraps a file until it no longer changes (a cut line can still be long); returns the new text. */
export function wrapFile(file: string, text: string, limit: number = LIMIT): string {
  let current = text;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = wrapText(file, current, limit);
    if (next === current) break;
    current = next;
  }
  return current;
}

if (import.meta.main) {
  const write = process.argv.includes('--write');
  const named = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  const files = (named.length > 0 ? named : formattableFiles()).filter((file) => CODE_FILE.test(file));
  let changed = 0;
  for (const file of files) {
    const path = resolve(ROOT, file);
    const before = readFileSync(path, 'utf8');
    const after = wrapFile(file, before);
    if (after === before) continue;
    changed += 1;
    if (write) writeFileSync(path, after);
    else console.log(file);
  }
  console.log(`wrap-long-lines: ${changed} files ${write ? 'rewritten' : 'would change'}`);
}
