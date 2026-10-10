/**
 * The blocks the FBD palette offers (LNG-007): the catalogue's, as far as the transpiler translates them, and the
 * blocks that carry a value in or out of the diagram.
 */

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

/** Every block type of the palette, once. */
export function fbdPaletteBlocks(): string[] {
  return [...new Set([...fbdPaletteCategories().flatMap((category) => category.blocks), ...FBD_VALUE_BLOCKS])];
}
