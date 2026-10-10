/** The badge that marks a library folder and a file no build reads in the project tree (IDE-023, CMP-046). */
import { useContext } from 'react';
import { TreeMarksContext, type TreeMark } from './treeMarksContext';

const LABEL: Record<TreeMark, { text: string; title: string }> = {
  library: { text: 'library', title: 'A library folder: the build reads the Structured Text files directly in it (libraries of zplc.json).' },
  'not-compiled': { text: 'not compiled', title: 'No build reads this file: it is neither in src nor directly in a library folder. List its folder under Declarations.' },
};

/** The badge after the name of a folder or file that has a mark; nothing for one that has none. */
export function TreeMarkBadge({ path }: { path: string }) {
  const mark = useContext(TreeMarksContext).get(path);
  if (!mark) return null;
  const { text, title } = LABEL[mark];
  return (
    <span
      title={title}
      data-tree-mark={mark}
      className={`ml-1 shrink-0 rounded border px-1 text-[10px] leading-4 ${mark === 'library' ? 'border-[var(--color-accent-blue)] text-[var(--color-accent-blue)]' : 'border-[var(--color-accent-yellow)] text-[var(--color-accent-yellow)]'}`}
    >
      {text}
    </span>
  );
}
