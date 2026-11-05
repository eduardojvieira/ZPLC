/**
 * The parser of a lesson reading page (LRN-040). A pure function of the Markdown text: no React, no Node, so the lesson
 * validator, the index generator and the application share it. The subset is the one `readingTypes.ts` describes; the
 * parser rejects everything outside it, each problem with its 1-based line, and never passes markup or a URL through:
 * the only strings in its output are text and code values, which the renderer draws as text.
 */
import { load } from 'js-yaml';

import type {
  LdFigureData,
  LdTryData,
  LdTryInput,
  QuizData,
  QuizOption,
  ReadingAlign,
  ReadingBlock,
  ReadingCalloutKind,
  ReadingDirective,
  ReadingInline,
  ReadingParseError,
  ReadingParseResult,
  TimingData,
  TimingMark,
  TimingSignal,
} from './readingTypes';

export const READING_DIRECTIVE_KINDS = ['ld-figure', 'ld-try', 'timing', 'quiz'] as const;

interface Line {
  text: string;
  /** 1-based line in the Markdown source. */
  n: number;
}
type Errors = ReadingParseError[];

const report = (errors: Errors, line: number, message: string): void => void errors.push({ line, message });

const HTML = 'raw HTML is not allowed';
const LINK = 'links are not allowed';
const IMAGE_SRC = 'an image src must be images/<name>.svg or images/<name>.png';
const CALLOUT_START = 'a quote must start with [!NOTE], [!TIP] or [!WARNING]';

// ---------------------------------------------------------------------------------------------------------------- inline

const ESCAPABLE = /[!-/:-@[-`{-~]/;

/** The index of the next unescaped `marker` in `src[from, to)` that closes an emphasis, or -1. */
function findClose(src: string, from: number, to: number, marker: '*' | '**'): number {
  for (let j = from; j < to; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (!src.startsWith(marker, j) || j >= to - marker.length + 1) continue;
    if (marker === '*' && ((j + 1 < to && src[j + 1] === '*') || (j > from && src[j - 1] === '*'))) continue;
    if (/\s/.test(src[j - 1] ?? ' ')) continue;
    // In a run of stars the last ones close, so that `**a *b***` closes the emphasis first and the strong after it.
    let close = j;
    if (marker === '**') while (src[close + 2] === '*' && close + 2 < to) close++;
    return close;
  }
  return -1;
}

/** Parses `src[from, to)`; `lineAt` maps an offset of `src` to its source line. */
function inline(src: string, from: number, to: number, lineAt: (offset: number) => number, errors: Errors): ReadingInline[] {
  const out: ReadingInline[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer !== '') out.push({ type: 'text', value: buffer });
    buffer = '';
  };
  const fail = (offset: number, message: string): void => void errors.push({ line: lineAt(offset), message });
  let i = from;
  while (i < to) {
    const c = src[i]!;
    const rest = src.slice(i, to);
    if (c === '\\' && i + 1 < to && ESCAPABLE.test(src[i + 1]!)) {
      buffer += src[i + 1];
      i += 2;
    } else if (c === '`') {
      let run = 1;
      while (src[i + run] === '`' && i + run < to) run++;
      const ticks = '`'.repeat(run);
      let close = src.indexOf(ticks, i + run);
      while (close >= 0 && close < to && src[close + run] === '`') close = src.indexOf(ticks, close + run + 1);
      if (close < 0 || close >= to) {
        buffer += ticks;
        i += run;
      } else {
        flush();
        let value = src.slice(i + run, close);
        if (value.length > 1 && value.startsWith(' ') && value.endsWith(' ') && value.trim() !== '') value = value.slice(1, -1);
        out.push({ type: 'code', value });
        i = close + run;
      }
    } else if (c === '!' && /^!\[[^\]]*\]\([^)]*\)/.test(rest)) {
      fail(i, 'an image must be alone on its line');
      i += /^!\[[^\]]*\]\([^)]*\)/.exec(rest)![0].length;
    } else if (c === '[' && /^\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/.test(rest)) {
      fail(i, LINK);
      i += /^\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/.exec(rest)![0].length;
    } else if (c === '<' && /^<(?:\/?[A-Za-z][^<>]*|![^<>]*)>/.test(rest)) {
      const tag = /^<(?:\/?[A-Za-z][^<>]*|![^<>]*)>/.exec(rest)![0];
      fail(i, /^<[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*>$/.test(tag) ? LINK : HTML);
      i += tag.length;
    } else if ((c === 'h' || c === 'w') && !/[A-Za-z0-9]/.test(src[i - 1] ?? ' ') && /^(?:https?:\/\/|www\.)\S/.test(rest)) {
      fail(i, LINK);
      i += /^\S+/.exec(rest)![0].length;
    } else if (c === '*') {
      const strong = src.startsWith('**', i);
      const marker = strong ? '**' : '*';
      const start = i + marker.length;
      const close = /\s/.test(src[start] ?? ' ') ? -1 : findClose(src, start, to, marker);
      if (close < 0) {
        buffer += marker;
        i = start;
      } else {
        flush();
        out.push({ type: strong ? 'strong' : 'emphasis', children: inline(src, start, close, lineAt, errors) });
        i = close + marker.length;
      }
    } else {
      buffer += c;
      i++;
    }
  }
  flush();
  return out;
}

/** The inline content of lines that form one run of text: joined with spaces, errors reported at the line they are on. */
function inlineOf(lines: Line[], errors: Errors): ReadingInline[] {
  const starts: number[] = [];
  let src = '';
  for (const line of lines) {
    if (src !== '') src += ' ';
    starts.push(src.length);
    src += line.text.trim();
  }
  const lineAt = (offset: number): number => {
    let index = 0;
    while (index + 1 < starts.length && starts[index + 1]! <= offset) index++;
    return lines[index]!.n;
  };
  return inline(src, 0, src.length, lineAt, errors);
}

// ----------------------------------------------------------------------------------------------------------------- blocks

const indentOf = (text: string): number => text.length - text.trimStart().length;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#+)(?:\s+(.*?))?\s*$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const MARKER = /^( *)([-*]|\d+\.)( +)(\S.*)$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)]*)\)\s*$/;
const QUOTE = /^ {0,3}> ?/;
const ALIGN_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/** Whether the line at `index` starts a block other than a paragraph. */
function startsBlock(lines: Line[], index: number): boolean {
  const text = lines[index]!.text;
  return (
    FENCE.test(text) ||
    HEADING.test(text) ||
    RULE.test(text) ||
    QUOTE.test(text) ||
    MARKER.test(text) ||
    IMAGE.test(text) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines: Line[], index: number): boolean {
  const next = lines[index + 1]?.text;
  return lines[index]!.text.includes('|') && next !== undefined && next.includes('|') && next.includes('-') && ALIGN_ROW.test(next);
}

/** The cells of a table row; a pipe escaped with a backslash stays in its cell. */
function cellsOf(text: string): string[] {
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) cell += text[i++]! + text[i];
    else if (text[i] === '|') {
      cells.push(cell);
      cell = '';
    } else cell += text[i];
  }
  cells.push(cell);
  const trimmed = text.trim();
  if (trimmed.startsWith('|')) cells.shift();
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) cells.pop();
  return cells.map((each) => each.trim());
}

function alignOf(cell: string): ReadingAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : left ? 'left' : right ? 'right' : null;
}

function parseList(lines: Line[], level: number, errors: Errors): ReadingBlock {
  const first = MARKER.exec(lines[0]!.text)!;
  const base = first[1]!.length;
  const items: Array<{ text: Line[]; child: Line[] }> = [];
  for (const line of lines) {
    const marker = MARKER.exec(line.text);
    if (marker && marker[1]!.length <= base) items.push({ text: [{ text: marker[4]!, n: line.n }], child: [] });
    else {
      const item = items[items.length - 1]!;
      (marker || item.child.length > 0 ? item.child : item.text).push(line);
    }
  }
  return {
    type: 'list',
    ordered: /\d/.test(first[2]!),
    items: items.map((item) => {
      const blocks: ReadingBlock[] = [{ type: 'paragraph', children: inlineOf(item.text, errors) }];
      if (item.child.length > 0) {
        if (level >= 1) report(errors, item.child[0]!.n, 'lists nest one level at most');
        else blocks.push(parseList(item.child, level + 1, errors));
      }
      return blocks;
    }),
  };
}

/** The lines of the list that starts at `index`: those that are its items, nested items or continuations. */
function listEnd(lines: Line[], index: number): number {
  const first = MARKER.exec(lines[index]!.text)!;
  const base = first[1]!.length;
  const ordered = /\d/.test(first[2]!);
  let end = index + 1;
  for (; end < lines.length; end++) {
    const text = lines[end]!.text;
    if (text.trim() === '') break;
    const marker = MARKER.exec(text);
    if (marker ? marker[1]!.length <= base && /\d/.test(marker[2]!) !== ordered : indentOf(text) <= base) break;
  }
  return end;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const underReading = (src: unknown): src is string =>
  typeof src === 'string' && /^reading\/[^\\]+$/.test(src) && src.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

function parseFigure(body: Record<string, unknown>, problems: string[]): LdFigureData | undefined {
  if (!underReading(body.src)) problems.push('src must be a file under reading/');
  if (body.rung !== undefined && !(Number.isInteger(body.rung) && (body.rung as number) > 0))
    problems.push('rung must be a positive integer');
  if (body.caption !== undefined && !text(body.caption)) problems.push('caption must be text');
  if (problems.length > 0) return undefined;
  return { src: body.src as string, ...(body.rung === undefined ? {} : { rung: body.rung as number }), ...caption(body) };
}

const caption = (body: Record<string, unknown>): { caption?: string } =>
  typeof body.caption === 'string' ? { caption: body.caption } : {};

function parseTry(body: Record<string, unknown>, problems: string[]): LdTryData | undefined {
  if (!underReading(body.src) || !body.src.endsWith('.ld.json')) problems.push('src must be a file under reading/ ending .ld.json');
  const inputs: LdTryInput[] = [];
  const rawInputs = Array.isArray(body.inputs) ? (body.inputs as unknown[]) : [];
  if (rawInputs.length < 1 || rawInputs.length > 8) problems.push('needs 1 to 8 inputs');
  else
    rawInputs.forEach((input, index) => {
      if (isObject(input) && text(input.name) && (input.kind === 'push' || input.kind === 'switch'))
        inputs.push({ name: input.name, kind: input.kind });
      else problems.push(`input ${index + 1} needs a name and a kind of push or switch`);
    });
  const outputs: string[] = [];
  const rawOutputs = Array.isArray(body.outputs) ? (body.outputs as unknown[]) : [];
  if (rawOutputs.length < 1 || rawOutputs.length > 8) problems.push('needs 1 to 8 outputs');
  else
    rawOutputs.forEach((output, index) => {
      if (text(output)) outputs.push(output);
      else problems.push(`output ${index + 1} needs a name`);
    });
  let timing: string[] | undefined;
  if (body.timing !== undefined) {
    if (!Array.isArray(body.timing) || !body.timing.every(text)) problems.push('timing must be a list of signal names');
    else {
      timing = body.timing as string[];
      for (const name of timing)
        if (![...inputs.map((input) => input.name), ...outputs].includes(name))
          problems.push(`timing names "${name}", which is neither an input nor an output`);
    }
  }
  if (body.caption !== undefined && !text(body.caption)) problems.push('caption must be text');
  if (problems.length > 0) return undefined;
  return { src: body.src as string, inputs, outputs, ...(timing ? { timing } : {}), ...caption(body) };
}

function parseTiming(body: Record<string, unknown>, problems: string[]): TimingData | undefined {
  const span = body.span;
  const spanOk = isNumber(span) && span > 0;
  if (!spanOk) problems.push('span must be a number above 0');
  const signals: TimingSignal[] = [];
  const rawSignals = Array.isArray(body.signals) ? (body.signals as unknown[]) : [];
  if (rawSignals.length < 1 || rawSignals.length > 8) problems.push('needs 1 to 8 signals');
  else
    rawSignals.forEach((signal, index) => {
      if (!isObject(signal) || !text(signal.name) || !Array.isArray(signal.edges) || !signal.edges.every(isNumber)) {
        problems.push(`signal ${index + 1} needs a name and a list of edges`);
        return;
      }
      const edges = signal.edges as number[];
      if (edges.some((edge, at) => at > 0 && edge <= edges[at - 1]!))
        problems.push(`the edges of ${signal.name} must be strictly ascending`);
      if (spanOk && edges.some((edge) => edge < 0 || edge > span)) problems.push(`the edges of ${signal.name} must lie within the span`);
      signals.push({ name: signal.name, edges });
    });
  const marks: TimingMark[] = [];
  if (body.marks !== undefined) {
    if (!Array.isArray(body.marks)) problems.push('marks must be a list');
    else
      (body.marks as unknown[]).forEach((mark, index) => {
        const where = `mark ${index + 1}`;
        if (!isObject(mark) || !isNumber(mark.from) || !isNumber(mark.to)) {
          problems.push(`${where} needs from and to`);
          return;
        }
        if (mark.from >= mark.to) problems.push(`${where} needs from < to`);
        if (spanOk && (mark.from < 0 || mark.to > span)) problems.push(`${where} must lie within the span`);
        if (!text(mark.label)) problems.push(`${where} needs a label`);
        else marks.push({ from: mark.from, to: mark.to, label: mark.label });
      });
  }
  if (body.caption !== undefined && !text(body.caption)) problems.push('caption must be text');
  if (problems.length > 0) return undefined;
  return { span: span as number, signals, ...(body.marks === undefined ? {} : { marks }), ...caption(body) };
}

function parseQuiz(body: Record<string, unknown>, problems: string[]): QuizData | undefined {
  if (!text(body.question)) problems.push('needs a question');
  const options: QuizOption[] = [];
  const raw = Array.isArray(body.options) ? (body.options as unknown[]) : [];
  if (raw.length < 2 || raw.length > 4) problems.push('needs 2 to 4 options');
  else {
    raw.forEach((option, index) => {
      const where = `option ${index + 1}`;
      if (!isObject(option) || !text(option.text)) return void problems.push(`${where} needs a text`);
      if (option.correct !== undefined && typeof option.correct !== 'boolean') problems.push(`${where}: correct must be true or false`);
      if (!text(option.feedback)) problems.push(`${where} needs feedback`);
      options.push({
        text: option.text,
        ...(option.correct === undefined ? {} : { correct: option.correct as boolean }),
        feedback: typeof option.feedback === 'string' ? option.feedback : '',
      });
    });
    if (options.filter((option) => option.correct === true).length !== 1) problems.push('exactly one option must be correct');
  }
  if (problems.length > 0) return undefined;
  return { question: body.question as string, options };
}

const KEYS: Record<ReadingDirective['kind'], readonly string[]> = {
  'ld-figure': ['src', 'rung', 'caption'],
  'ld-try': ['src', 'inputs', 'outputs', 'timing', 'caption'],
  timing: ['span', 'signals', 'marks', 'caption'],
  quiz: ['question', 'options'],
};

function parseDirective(kind: ReadingDirective['kind'], bodyText: string, line: number, errors: Errors): ReadingBlock | undefined {
  const fail = (message: string): void => void errors.push({ line, message: `${kind}: ${message}` });
  let body: unknown;
  try {
    body = load(bodyText);
  } catch (error) {
    return void fail(`invalid YAML (${error instanceof Error ? error.message.split('\n', 1)[0] : 'unreadable'})`);
  }
  if (!isObject(body)) return void fail('the body must be a YAML mapping');
  const problems = Object.keys(body)
    .filter((key) => !KEYS[kind].includes(key))
    .map((key) => `unknown key "${key}"`);
  if (problems.length > 0) return void problems.forEach(fail);
  const data =
    kind === 'ld-figure'
      ? parseFigure(body, problems)
      : kind === 'ld-try'
        ? parseTry(body, problems)
        : kind === 'timing'
          ? parseTiming(body, problems)
          : parseQuiz(body, problems);
  problems.forEach(fail);
  return data ? { type: 'directive', directive: { kind, data } as ReadingDirective, line } : undefined;
}

function parseBlocks(lines: Line[], errors: Errors): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const raw = line.text;
    if (raw.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE.exec(raw);
    if (fence) {
      const marks = fence[1]!;
      const close = new RegExp(`^ {0,3}${marks[0] === '`' ? '`' : '~'}{${marks.length},}\\s*$`);
      let end = i + 1;
      while (end < lines.length && !close.test(lines[end]!.text)) end++;
      const info = fence[2]!;
      if (end >= lines.length) report(errors, line.n, 'the code fence is never closed');
      const body = lines.slice(i + 1, end).map((each) => each.text);
      i = end + 1;
      if (end >= lines.length) continue;
      if ((READING_DIRECTIVE_KINDS as readonly string[]).includes(info)) {
        const block = parseDirective(info as ReadingDirective['kind'], body.join('\n'), line.n, errors);
        if (block) blocks.push(block);
      } else if (info.startsWith('ld-')) report(errors, line.n, `unknown live block "${info}"`);
      else blocks.push({ type: 'code', lang: info, value: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(raw);
    if (heading && heading[2] !== undefined) {
      const depth = heading[1]!.length;
      if (depth === 1) report(errors, line.n, 'level-1 headings are not allowed: the title comes from the lesson text');
      else if (depth > 3) report(errors, line.n, 'headings deeper than level 3 are not allowed');
      else
        blocks.push({
          type: 'heading',
          depth: depth as 2 | 3,
          children: inlineOf([{ text: heading[2]!.replace(/\s+#+$/, ''), n: line.n }], errors),
        });
      i++;
      continue;
    }
    if (RULE.test(raw)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(raw)) {
      let end = i;
      while (end < lines.length && QUOTE.test(lines[end]!.text)) end++;
      const inner = lines.slice(i, end).map((each) => ({ text: each.text.replace(QUOTE, ''), n: each.n }));
      const kind = /^\[!(NOTE|TIP|WARNING)\]\s*$/.exec(inner[0]!.text)?.[1];
      if (!kind) report(errors, line.n, CALLOUT_START);
      else blocks.push({ type: 'callout', kind: kind.toLowerCase() as ReadingCalloutKind, children: parseBlocks(inner.slice(1), errors) });
      i = end;
      continue;
    }
    const image = IMAGE.exec(raw);
    if (image) {
      const [, alt, src] = image;
      if (!/^images\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:svg|png)$/.test(src!) || src!.includes('..')) report(errors, line.n, IMAGE_SRC);
      else if (alt!.trim() === '') report(errors, line.n, 'an image needs alt text');
      else blocks.push({ type: 'image', src: src!, alt: alt!.trim() });
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const header = cellsOf(raw);
      const align = cellsOf(lines[i + 1]!.text);
      let end = i + 2;
      while (end < lines.length && lines[end]!.text.trim() !== '' && lines[end]!.text.includes('|')) end++;
      if (align.length !== header.length)
        report(errors, lines[i + 1]!.n, `the alignment row has ${align.length} cells but the header has ${header.length}`);
      else {
        const rows: ReadingInline[][][] = [];
        for (const row of lines.slice(i + 2, end)) {
          const cells = cellsOf(row.text);
          if (cells.length !== header.length)
            report(errors, row.n, `a table row has ${cells.length} cells but the header has ${header.length}`);
          else rows.push(cells.map((cell) => inlineOf([{ text: cell, n: row.n }], errors)));
        }
        blocks.push({
          type: 'table',
          header: header.map((cell) => inlineOf([{ text: cell, n: line.n }], errors)),
          align: align.map(alignOf),
          rows,
        });
      }
      i = end;
      continue;
    }
    if (MARKER.test(raw)) {
      const end = listEnd(lines, i);
      blocks.push(parseList(lines.slice(i, end), 0, errors));
      i = end;
      continue;
    }
    let end = i + 1;
    while (end < lines.length && lines[end]!.text.trim() !== '' && !startsBlock(lines, end)) end++;
    blocks.push({ type: 'paragraph', children: inlineOf(lines.slice(i, end), errors) });
    i = end;
  }
  return blocks;
}

/** Parses a reading page. Problems are returned, never thrown; a block that has a problem is left out of `blocks`. */
export function parseReading(markdown: string): ReadingParseResult {
  const errors: Errors = [];
  const lines = markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((value, index): Line => ({ text: value, n: index + 1 }));
  return { blocks: parseBlocks(lines, errors), errors };
}

// ------------------------------------------------------------------------------------------------------------------ parity

const listShape = (blocks: ReadingBlock[]): unknown[] => blocks.map(blockShape);

function blockShape(block: ReadingBlock): unknown {
  switch (block.type) {
    case 'heading':
      return ['heading', block.depth];
    case 'paragraph':
      return ['paragraph'];
    case 'list':
      return [block.ordered ? 'ol' : 'ul', block.items.map(listShape)];
    case 'table':
      return ['table', block.header.length, block.rows.length, block.align];
    case 'callout':
      return ['callout', block.kind, listShape(block.children)];
    case 'code':
      return ['code', block.lang];
    case 'image':
      return ['image', block.src];
    case 'rule':
      return ['rule'];
    case 'directive':
      return ['directive', block.directive.kind, directiveShape(block.directive)];
  }
}

/** The fields of a live block that are not text: they must be equal in every language. */
function directiveShape(directive: ReadingDirective): unknown {
  switch (directive.kind) {
    case 'ld-figure':
      return { src: directive.data.src, rung: directive.data.rung ?? null };
    case 'ld-try':
      return { ...directive.data, caption: undefined };
    case 'timing':
      return { span: directive.data.span, signals: directive.data.signals, marks: directive.data.marks ?? [], caption: undefined };
    case 'quiz':
      return directive.data.options.map((option) => option.correct === true);
  }
}

/**
 * A JSON-comparable shape of a page, for the English and Spanish pages to be equal in: the sequence of block kinds and
 * heading depths, list nesting and item counts, table size and alignment, callout kinds, code languages, image sources,
 * and every field of a live block that is not text. Prose, captions, questions, option texts and feedback are left out.
 */
export function readingShape(blocks: ReadingBlock[]): unknown {
  return JSON.parse(JSON.stringify(listShape(blocks)));
}
