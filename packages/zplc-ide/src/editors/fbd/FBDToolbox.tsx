/**
 * FBDToolbox - Sidebar with the blocks of the FBD editor
 * 
 * Categorized palette of function blocks, logic gates, etc. A block is a button: dragging it onto the canvas places it
 * there, and pressing it (Enter, Space or a click) inserts it beside the selected block (LNG-012). The search box
 * filters the blocks of every category by name.
 */

import { useState, type ReactElement } from 'react';
import { ChevronDown, ChevronRight, Timer, Binary, Hash, GitBranch, Calculator, ToggleLeft, Zap, ArrowRightLeft, Repeat, Gauge, Database, Type, Radio } from 'lucide-react';
import { FBD_VALUE_BLOCKS, fbdPaletteCategories } from './palette';
import { describeProjectBlock, projectPalette } from '../../models/projectBlocks';
import { filterItems } from '../picker';
import { useProjectBlocks } from '../useProjectBlocks';
import { paletteChoices } from './keyboard';

// =============================================================================
// Block Categories
// =============================================================================

interface BlockCategory {
  name: string;
  icon: ReactElement;
  blocks: string[];
}

const CATEGORY_ICONS: Record<string, ReactElement> = {
  Timers: <Timer size={14} />,
  Counters: <Hash size={14} />,
  'Edge Detection': <GitBranch size={14} />,
  Bistables: <ToggleLeft size={14} />,
  Generators: <Repeat size={14} />,
  'Process Control': <Gauge size={14} />,
  System: <Database size={14} />,
  Communication: <Radio size={14} />,
  'Logic Gates': <Binary size={14} />,
  Comparison: <GitBranch size={14} />,
  Math: <Calculator size={14} />,
  Trigonometry: <Calculator size={14} />,
  Selection: <GitBranch size={14} />,
  Bitwise: <Zap size={14} />,
  'Type Conversion': <ArrowRightLeft size={14} />,
  Strings: <Type size={14} />,
  Other: <Database size={14} />,
};

// Only the blocks that the transpiler translates are offered (LNG-007)
const BLOCK_CATEGORIES: BlockCategory[] = fbdPaletteCategories().map((category) => ({
  ...category,
  icon: CATEGORY_ICONS[category.name] ?? <Database size={14} />,
}));

// =============================================================================
// Component
// =============================================================================

interface FBDToolboxProps {
  /** A block was pressed: it is inserted beside the selected block. */
  onInsert?: (blockType: string) => void;
}

const ITEM_CLASS = `mx-2 my-0.5 block w-[calc(100%-1rem)] px-2 py-1 rounded text-left text-xs font-mono text-[var(--text-primary)]
  bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] cursor-grab active:cursor-grabbing
  border border-transparent hover:border-[var(--color-accent-blue)] transition-colors
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]`;

export default function FBDToolbox({ onInsert }: FBDToolboxProps) {
  const [query, setQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Project', 'Timers', 'Logic Gates']) // Default expanded
  );
  // The function blocks and functions the project declares come first: they are the ones the author wrote (LNG-008)
  const projectBlocks = useProjectBlocks();
  const project = projectPalette(projectBlocks);
  const categories: BlockCategory[] = project
    ? [{ ...project, icon: <Database size={14} /> }, ...BLOCK_CATEGORIES]
    : BLOCK_CATEGORIES;
  const descriptions = new Map(projectBlocks.map((block) => [block.name, describeProjectBlock(block)] as const));
  // a search shows the blocks that match in every category, whether it is expanded or not
  const searching = query.trim() !== '';
  const found = searching ? new Set(filterItems(paletteChoices(projectBlocks), query).map((item) => item.id)) : null;
  const shown = found ? categories.map((category) => ({ ...category, blocks: category.blocks.filter((block) => found.has(block)) })).filter((category) => category.blocks.length > 0) : categories;
  const ioBlocks = found ? FBD_VALUE_BLOCKS.filter((block) => found.has(block)) : FBD_VALUE_BLOCKS;

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const onDragStart = (event: React.DragEvent, blockType: string) => {
    event.dataTransfer.setData('application/zplc-block', blockType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="zplc-visual-toolbox w-48 h-full border-r overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--color-surface-700)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Blocks
        </span>
      </div>

      <div className="px-2 pt-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search the blocks"
          placeholder="Search"
          className="w-full rounded border border-[var(--border-color)] bg-[var(--color-surface-700)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--color-accent-blue)] focus:outline-none"
        />
      </div>

      {/* Categories */}
      <div className="py-1">
        {shown.map((category) => {
          const isExpanded = searching || expandedCategories.has(category.name);
          
          return (
            <div key={category.name} className="select-none">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-700)] transition-colors"
              >
                <span className="text-[var(--text-tertiary)]">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="text-[var(--text-tertiary)]">{category.icon}</span>
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {category.name}
                </span>
              </button>

              {/* Blocks */}
              {isExpanded && (
                <div className="pb-1">
                  {category.blocks.map((block) => (
                    <button
                      type="button"
                      key={block}
                      draggable
                      onDragStart={(e) => onDragStart(e, block)}
                      onClick={() => onInsert?.(block)}
                      data-fbd-toolbox-item={block}
                      aria-label={`Insert ${block}`}
                      title={category.name === 'Project' ? descriptions.get(block) : `${block}: press to insert beside the selected block, or drag onto the canvas`}
                      className={ITEM_CLASS}
                    >
                      {block}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Special blocks section */}
      <div className="border-t border-[var(--border-color)] py-1">
        <div className="px-3 py-1.5">
          <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
            I/O
          </span>
        </div>
        {ioBlocks.map((block) => (
          <button
            type="button"
            key={block}
            draggable
            onDragStart={(e) => onDragStart(e, block)}
            onClick={() => onInsert?.(block)}
            data-fbd-toolbox-item={block}
            aria-label={`Insert ${block}`}
            className={ITEM_CLASS}
          >
            {block.toUpperCase()}
          </button>
        ))}
        {searching && shown.length === 0 && ioBlocks.length === 0 ? <p className="px-3 py-1 text-[10px] text-[var(--text-tertiary)]">Nothing matches.</p> : null}
      </div>

      {/* Help text */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          Press a block to insert it beside the selected one, or drag it onto the canvas. Connect outputs (green) to inputs (blue), or press C on a block.
        </p>
      </div>
    </div>
  );
}
