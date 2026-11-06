/** The element palette of the ladder editor as the items of the search list (LNG-012). */

import { getToolboxItems } from '../../models/ld';
import type { ProjectBlock } from '../../models/projectBlocks';
import type { PickerItem } from '../picker';
import type { LDInsert } from './keyboard';
import { functionItems, functionKindLabel } from './ldFunctions';

/** The palette as list items: the label of the toolbox, found by what it is, its type and its symbol. */
export function paletteItems(projectBlocks: readonly ProjectBlock[]): Array<PickerItem & { insert: LDInsert }> {
  const standard = getToolboxItems(projectBlocks).map((item) => ({
    id: `${item.type}:${item.fbType ?? ''}`,
    label: item.label,
    detail: `${item.symbol} · ${item.category.replace('_', ' ')}`,
    keywords: [item.type, item.fbType ?? '', item.category],
    insert: { type: item.type, fbType: item.fbType, category: item.category } as LDInsert,
  }));
  // the functions (LNG-028): found by name, by operator and by kind, in either language
  const functions = functionItems().map((item) => ({
    id: `function:${item.functionName}`,
    label: item.label,
    detail: `${item.symbol} · ${functionKindLabel(item.kind!)}`,
    keywords: ['function', item.kind!, item.symbol],
    insert: { type: 'function', functionName: item.functionName, category: 'function' } as LDInsert,
  }));
  return [...standard, ...functions];
}
