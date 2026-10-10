/**
 * The function blocks and functions the project declares, for the palettes of the visual editors (LNG-008)
 *
 * SPDX-License-Identifier: MIT
 */

import { useMemo } from 'react';
import { useIDEStore } from '../store/useIDEStore';
import { useProjectSources } from '../store/projectSources';
import { collectProjectBlocks, type ProjectBlock } from '../models/projectBlocks';

/**
 * The blocks of the Structured Text files of the open project: the ones the editor has loaded, which change as they are
 * typed, and the ones it has not (the files the build reads, and every file of a library folder, IDE-023).
 */
export function useProjectBlocks(): ProjectBlock[] {
  const files = useIDEStore((state) => state.loadedFiles);
  const sources = useProjectSources((state) => state.sources);
  return useMemo(() => {
    const loaded = [...files.values()];
    const paths = new Set(loaded.map((file) => file.path ?? file.name));
    return collectProjectBlocks([...loaded, ...sources.filter((source) => !paths.has(source.path))]);
  }, [files, sources]);
}
