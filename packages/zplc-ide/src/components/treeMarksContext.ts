/**
 * What the build makes of a place in the project tree (IDE-023, CMP-046): a folder that `libraries` of zplc.json lists,
 * and a Structured Text file that no build reads (not in `src`, not directly in a library folder). The Explorer marks
 * both, so that a library that was never listed, the usual reason for a file that is not compiled, is seen in the tree.
 */
import { createContext } from 'react';

export type TreeMark = 'library' | 'not-compiled';

/** Path of a folder or file of the tree to its mark. */
export const TreeMarksContext = createContext<ReadonlyMap<string, TreeMark>>(new Map());
