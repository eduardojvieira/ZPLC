/**
 * The function blocks and functions the project declares, for the palettes of the visual editors (LNG-008)
 *
 * SPDX-License-Identifier: MIT
 */

import { useMemo } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { collectProjectBlocks, type ProjectBlock } from '../models/projectBlocks';

/**
 * The blocks of every Structured Text file of the open project that the editor has loaded; they change when a
 * file does. The build reads all the files of the project from disk, so a file not loaded yet is still built.
 */
export function useProjectBlocks(): ProjectBlock[] {
  const files = useIDEStore((state) => state.loadedFiles);
  return useMemo(() => collectProjectBlocks(files.values()), [files]);
}
