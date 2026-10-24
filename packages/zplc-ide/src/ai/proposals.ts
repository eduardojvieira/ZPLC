/**
 * What an assistant may propose besides a change set (IDE-030): editor actions from a closed list, and a few display settings.
 * A proposal is data the person sees as a button; it runs only when they click it, through the command or the setter they
 * would use themselves. Nothing physical is in the list, and a test holds it against the command registry. Pure, so the main
 * process, the window and the tests share it; the lists of values are those of the application, held equal by a test.
 */
import { isCandidateSourcePath } from './candidatePaths';

export const AI_PROPOSAL_CAP = 6;

/** The commands of the registry a proposal may run, by the name the model uses: none of them touches a device. */
export const AI_COMMAND_PROPOSALS = {
  compile: 'build.compile',
  generateSt: 'build.generateSt',
  startSimulation: 'online.simulation',
} as const;

export const AI_PROPOSABLE_SETTINGS = ['theme', 'language', 'density', 'editorFontSize', 'editorTabSize'] as const;
export const AI_THEME_CHOICES = ['light', 'dark', 'high-contrast', 'system'] as const;
export const AI_LANGUAGE_CHOICES = ['auto', 'en', 'es'] as const;
export const AI_DENSITY_CHOICES = ['comfortable', 'compact'] as const;
export const AI_TAB_SIZE_CHOICES = [2, 3, 4, 8] as const;
export const AI_FONT_SIZE_RANGE = { min: 10, max: 32 } as const;

export type AiSettingName = (typeof AI_PROPOSABLE_SETTINGS)[number];
export type AiProposal =
  | { type: 'openFile'; path: string }
  | { type: 'goToLine'; path: string; line: number }
  | { type: 'selectElement'; path: string; element: string }
  | { type: keyof typeof AI_COMMAND_PROPOSALS }
  | { type: 'setting'; name: 'theme'; value: (typeof AI_THEME_CHOICES)[number] }
  | { type: 'setting'; name: 'language'; value: (typeof AI_LANGUAGE_CHOICES)[number] }
  | { type: 'setting'; name: 'density'; value: (typeof AI_DENSITY_CHOICES)[number] }
  | { type: 'setting'; name: 'editorFontSize'; value: number }
  | { type: 'setting'; name: 'editorTabSize'; value: (typeof AI_TAB_SIZE_CHOICES)[number] };

const LINE_MAX = 1_000_000;
const ELEMENT = /^(rung|block|step|transition):[A-Za-z0-9_%.,!~*'()-]{1,200}$/;
const ELEMENT_KINDS: Record<string, readonly string[]> = { 'ld.json': ['rung'], 'fbd.json': ['block'], 'sfc.json': ['step', 'transition'] };

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== keys.length || !keys.every((key) => names.includes(key))) return null;
    const record: Record<string, unknown> = {};
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}
const oneOf = <T extends readonly unknown[]>(choices: T, value: unknown): value is T[number] => choices.includes(value);

function parseOne(value: unknown): AiProposal | null {
  let type: unknown;
  try {
    type = typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined;
  } catch {
    return null;
  }
  if (typeof type !== 'string') return null;
  if (Object.hasOwn(AI_COMMAND_PROPOSALS, type)) return exact(value, ['type']) ? ({ type } as AiProposal) : null;
  if (type === 'openFile') {
    const item = exact(value, ['type', 'path']);
    return item && isCandidateSourcePath(item.path) ? { type, path: item.path } : null;
  }
  if (type === 'goToLine') {
    const item = exact(value, ['type', 'path', 'line']);
    return item && isCandidateSourcePath(item.path) && Number.isSafeInteger(item.line) && (item.line as number) >= 1 && (item.line as number) <= LINE_MAX
      ? { type, path: item.path, line: item.line as number }
      : null;
  }
  if (type === 'selectElement') {
    const item = exact(value, ['type', 'path', 'element']);
    if (!item || !isCandidateSourcePath(item.path) || typeof item.element !== 'string' || !ELEMENT.test(item.element)) return null;
    const kinds = ELEMENT_KINDS[item.path.slice(item.path.indexOf('.') + 1)];
    return kinds?.includes(item.element.slice(0, item.element.indexOf(':'))) ? { type, path: item.path, element: item.element } : null;
  }
  if (type === 'setting') {
    const item = exact(value, ['type', 'name', 'value']);
    if (!item) return null;
    const { name, value: setting } = item;
    if (name === 'theme' && oneOf(AI_THEME_CHOICES, setting)) return { type, name, value: setting };
    if (name === 'language' && oneOf(AI_LANGUAGE_CHOICES, setting)) return { type, name, value: setting };
    if (name === 'density' && oneOf(AI_DENSITY_CHOICES, setting)) return { type, name, value: setting };
    if (name === 'editorTabSize' && oneOf(AI_TAB_SIZE_CHOICES, setting)) return { type, name, value: setting };
    if (
      name === 'editorFontSize' &&
      Number.isInteger(setting) &&
      (setting as number) >= AI_FONT_SIZE_RANGE.min &&
      (setting as number) <= AI_FONT_SIZE_RANGE.max
    )
      return { type, name, value: setting as number };
  }
  return null;
}

/** The proposals of an answer: none when it has none, null when any of them is not exactly one of the list or there are too many. */
export function parseProposals(value: unknown): AiProposal[] | null {
  if (value === undefined) return [];
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > AI_PROPOSAL_CAP) return null;
    const proposals: AiProposal[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      const proposal = descriptor && 'value' in descriptor ? parseOne(descriptor.value) : null;
      if (!proposal) return null;
      proposals.push(proposal);
    }
    return proposals;
  } catch {
    return null;
  }
}
