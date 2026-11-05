/**
 * Shapes shared by the reading-page parser, the lesson validator, the lesson index and the renderer (LRN-039 to LRN-042).
 *
 * A reading page is Markdown in a subset of its own: level-2 and level-3 headings, paragraphs, strong, emphasis, inline
 * code, lists, tables, note/tip/warning callouts, fenced code, images from the lesson package, rules, and live blocks. A
 * live block is a fenced block whose info string is its kind and whose body is YAML. There are no links and no raw HTML.
 *
 * This module has no React and no Node imports, so the app, the index generator and the tests share it.
 */

export type ReadingInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: ReadingInline[] }
  | { type: 'emphasis'; children: ReadingInline[] }
  | { type: 'code'; value: string };

export type ReadingCalloutKind = 'note' | 'tip' | 'warning';

export type ReadingAlign = 'left' | 'center' | 'right' | null;

/** A Ladder figure, drawn read-only. `src` names a file under `reading/` in the lesson package; `rung` is 1-based. */
export interface LdFigureData {
  src: string;
  rung?: number;
  caption?: string;
}

/** `push` is on while pressed, `switch` toggles on each press. */
export type LdTryInputKind = 'push' | 'switch';

export interface LdTryInput {
  name: string;
  kind: LdTryInputKind;
}

/** A try-it lab: one LD POU under `reading/`, compiled by the Studio compiler and run on its own WASM session. */
export interface LdTryData {
  src: string;
  inputs: LdTryInput[];
  outputs: string[];
  /** Signals drawn on a live timing chart of the run. */
  timing?: string[];
  caption?: string;
}

/** A signal starts FALSE and toggles at each edge, in milliseconds from the start. */
export interface TimingSignal {
  name: string;
  edges: number[];
}

export interface TimingMark {
  from: number;
  to: number;
  label: string;
}

export interface TimingData {
  /** Milliseconds shown on the time axis. */
  span: number;
  signals: TimingSignal[];
  marks?: TimingMark[];
  caption?: string;
}

export interface QuizOption {
  text: string;
  correct?: boolean;
  feedback: string;
}

/** A self-check question: two to four options, exactly one correct. It is neither graded nor stored. */
export interface QuizData {
  question: string;
  options: QuizOption[];
}

export type ReadingDirective =
  | { kind: 'ld-figure'; data: LdFigureData }
  | { kind: 'ld-try'; data: LdTryData }
  | { kind: 'timing'; data: TimingData }
  | { kind: 'quiz'; data: QuizData };

export type ReadingDirectiveKind = ReadingDirective['kind'];

export type ReadingBlock =
  | { type: 'heading'; depth: 2 | 3; children: ReadingInline[] }
  | { type: 'paragraph'; children: ReadingInline[] }
  /** Each item holds paragraphs and at most one nested list level. */
  | { type: 'list'; ordered: boolean; items: ReadingBlock[][] }
  | { type: 'table'; header: ReadingInline[][]; align: ReadingAlign[]; rows: ReadingInline[][][] }
  | { type: 'callout'; kind: ReadingCalloutKind; children: ReadingBlock[] }
  | { type: 'code'; lang: string; value: string }
  /** An image alone on its line; `src` is package-relative, e.g. `images/relay-panel.svg`. */
  | { type: 'image'; src: string; alt: string }
  | { type: 'directive'; directive: ReadingDirective; line: number }
  | { type: 'rule' };

export interface ReadingParseError {
  /** 1-based line in the Markdown source. */
  line: number;
  message: string;
}

export interface ReadingParseResult {
  blocks: ReadingBlock[];
  errors: ReadingParseError[];
}

/** The reading page of a lesson as the generated lesson index carries it. */
export interface LessonReading {
  /** Markdown after the build-time expansion of the quoted-fact markup. */
  en: string;
  es: string;
  /** Package-relative path to file text, for every file a live block references. */
  files: Record<string, string>;
  /** Package-relative paths of the images the page uses. */
  images: string[];
}
