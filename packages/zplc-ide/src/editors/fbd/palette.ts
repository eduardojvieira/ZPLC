/**
 * The blocks the FBD palette offers (LNG-007): the catalogue's, as far as the transpiler translates them, and the
 * blocks that carry a value in or out of the diagram.
 */

import { FUNCTION_CATEGORIES } from '@zplc/compiler';
import { currentLocale, t, type MessageKey } from '../../i18n';
import { getBlockCategories, type BlockCategoryDefinition } from '../../catalog/blockCatalog';
import { stdFunction } from '../../catalog/stdFunctions';
import { fbdPlacesBlock } from '../../transpiler/fbdToST';

/** The blocks that read a constant or a variable, and write one. */
export const FBD_VALUE_BLOCKS = ['constant', 'variable', 'input', 'output'] as const;

/** The categories of the catalogue with only the blocks a diagram can hold: the catalogue also names functions it cannot call. */
export function fbdPaletteCategories(): BlockCategoryDefinition[] {
  // built once: the 297 functions are filtered on every search and the list does not change while Studio runs
  return (categories ??= getBlockCategories()
    .map((category) => ({ ...category, blocks: category.blocks.filter((block) => fbdPlacesBlock(block)) }))
    .filter((category) => category.blocks.length > 0));
}
let categories: BlockCategoryDefinition[] | undefined;

const GROUP_KEYS: Record<string, MessageKey> = {
  Timers: 'statusText.group.timers',
  Counters: 'statusText.group.counters',
  'Edge Detection': 'statusText.group.edgeDetection',
  Bistables: 'statusText.group.bistables',
  Generators: 'statusText.group.generators',
  'Process Control': 'statusText.group.processControl',
  System: 'statusText.group.system',
  Communication: 'statusText.group.communication',
  'Logic Gates': 'statusText.group.logicGates',
  Comparison: 'statusText.group.comparison',
  Math: 'statusText.group.math',
  Trigonometry: 'statusText.group.trigonometry',
  Selection: 'statusText.group.selection',
  Bitwise: 'statusText.group.bitwise',
  Conversions: 'fbd.group.conversions',
  Strings: 'statusText.group.strings',
  Other: 'statusText.group.other',
  Project: 'fbd.group.project',
};

/** The name of a block group in the language of the interface; the catalogue's English name stays the key of the group. */
export function blockGroupLabel(name: string): string {
  const key = GROUP_KEYS[name];
  if (key) return t(key);
  // a group named after a category of the compiler's table says its Spanish name
  const category = FUNCTION_CATEGORIES.find((candidate) => candidate.en === name);
  return category && currentLocale() === 'es' ? category.es : name;
}

/** What a function does, in the language of the interface: its `FUNCTION_DOCS` text, and for a conversion one catalogue message. */
export function functionDescription(name: string): string | undefined {
  const record = stdFunction(name);
  if (!record) return undefined;
  if (record.category === 'conversion') return t('fbd.conversionDescription', { from: record.inputs[0]![1], to: record.returns });
  return currentLocale() === 'es' ? record.es : record.en;
}

/** Every block type of the palette, once. */
export function fbdPaletteBlocks(): string[] {
  return [...new Set([...fbdPaletteCategories().flatMap((category) => category.blocks), ...FBD_VALUE_BLOCKS])];
}
