/**
 * The blocks the FBD palette offers (LNG-007): the catalogue's, as far as the transpiler translates them, and the
 * blocks that carry a value in or out of the diagram.
 */

import { t, type MessageKey } from '../../i18n';
import { getBlockCategories, type BlockCategoryDefinition } from '../../catalog/blockCatalog';
import { fbdPlacesBlock } from '../../transpiler/fbdToST';

/** The blocks that read a constant or a variable, and write one. */
export const FBD_VALUE_BLOCKS = ['constant', 'variable', 'input', 'output'] as const;

/** The categories of the catalogue with only the blocks a diagram can hold: the catalogue also names functions it cannot call. */
export function fbdPaletteCategories(): BlockCategoryDefinition[] {
  return getBlockCategories()
    .map((category) => ({ ...category, blocks: category.blocks.filter((block) => fbdPlacesBlock(block)) }))
    .filter((category) => category.blocks.length > 0);
}

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
  'Type Conversion': 'statusText.group.typeConversion',
  Strings: 'statusText.group.strings',
  Other: 'statusText.group.other',
  Project: 'fbd.group.project',
};

/** The name of a block group in the language of the interface; the catalogue's English name stays the key of the group. */
export function blockGroupLabel(name: string): string {
  const key = GROUP_KEYS[name];
  return key ? t(key) : name;
}

/** Every block type of the palette, once. */
export function fbdPaletteBlocks(): string[] {
  return [...new Set([...fbdPaletteCategories().flatMap((category) => category.blocks), ...FBD_VALUE_BLOCKS])];
}
