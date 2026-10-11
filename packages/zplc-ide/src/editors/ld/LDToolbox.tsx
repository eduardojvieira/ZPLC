/**
 * LDToolbox - Element Palette for Ladder Diagram Editor
 * 
 * Every item is a button: dragging it onto the grid places it, and pressing it (Enter, Space or a click) inserts it at
 * the cursor of the keyboard editing (LNG-012). The search box above filters the items by name, type and symbol.
 * 
 * Provides items for:
 * - Contacts (NO, NC, P, N)
 * - Coils (Standard, Negated, Set, Reset)
 * - Structure (Branch for parallel paths)
 * - Function Blocks (TON, TOF, CTU, etc.)
 */

import { useState } from 'react';
import { getToolboxItems, type LDToolboxItem } from '../../models/ld';
import { filterItems } from '../picker';
import { useProjectBlocks } from '../useProjectBlocks';
import { DRAG_MIME_TYPE } from './ldDragData';

// =============================================================================
// Toolbox Item Component
// =============================================================================

interface ToolboxItemProps {
  item: LDToolboxItem;
  onInsert?: (item: LDToolboxItem) => void;
}

function ToolboxItem({ item, onInsert }: ToolboxItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    // Serialize the item data for transfer
    const data = JSON.stringify({
      type: item.type,
      fbType: item.fbType,
      category: item.category,
    });
    e.dataTransfer.setData(DRAG_MIME_TYPE, data);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Visual styling based on category
  const getCategoryStyles = (): string => {
    switch (item.category) {
      case 'contact':
        return 'border-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)]/10 text-[var(--color-accent-green)]';
      case 'coil':
        return 'border-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]';
      case 'structure':
        return 'border-[var(--color-accent-orange)] hover:bg-[var(--color-accent-orange)]/10 text-[var(--color-accent-orange)]';
      case 'function_block':
        return 'border-[var(--color-accent-yellow)] hover:bg-[var(--color-accent-yellow)]/10 text-[var(--color-accent-yellow)]';
      default:
        return 'border-[var(--color-surface-500)] hover:bg-[var(--color-surface-500)]/10 text-[var(--color-surface-200)]';
    }
  };

  return (
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onClick={() => onInsert?.(item)}
      data-ld-toolbox-item={`${item.type}${item.fbType ? `:${item.fbType}` : ''}`}
      aria-label={`Insert ${item.label}`}
      className={`
        flex flex-col items-center justify-center p-2 
        border-2 rounded cursor-grab active:cursor-grabbing
        transition-colors select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent-blue)]
        ${getCategoryStyles()}
      `}
      title={`${item.label}: press to insert at the cursor, or drag onto the grid`}
    >
      <span className="max-w-full break-all text-center font-mono text-xs font-bold leading-tight">{item.symbol}</span>
      <span className="max-w-full break-words text-center text-[9px] leading-tight text-[var(--color-surface-200)] mt-0.5">{item.label}</span>
    </button>
  );
}

// =============================================================================
// Toolbox Section
// =============================================================================

interface ToolboxSectionProps {
  title: string;
  items: LDToolboxItem[];
  onInsert?: (item: LDToolboxItem) => void;
}

function ToolboxSection({ title, items, onInsert }: ToolboxSectionProps) {
  if (items.length === 0) return null;
  
  return (
    <div className="mb-3">
      <h3 className="text-[10px] font-semibold text-[var(--color-surface-300)] uppercase tracking-wider mb-1.5 px-1">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item, idx) => (
          <ToolboxItem key={`${item.type}-${item.fbType || idx}`} item={item} onInsert={onInsert} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Toolbox Component
// =============================================================================

interface LDToolboxProps {
  /** An item was pressed: it is inserted at the cursor of the editor. */
  onInsert?: (item: LDToolboxItem) => void;
}

export default function LDToolbox({ onInsert }: LDToolboxProps) {
  // the function blocks of the project are placeable like the standard ones (LNG-008)
  const projectItems = getToolboxItems(useProjectBlocks());
  const [query, setQuery] = useState('');
  const found = new Set(filterItems(
    projectItems.map((item) => ({ id: `${item.type}:${item.fbType ?? ''}`, label: item.label, detail: item.category, keywords: [item.type, item.symbol, item.fbType ?? ''] })),
    query,
  ).map((item) => item.id));
  const allItems = projectItems.filter((item) => found.has(`${item.type}:${item.fbType ?? ''}`));

  const contacts = allItems.filter(i => i.category === 'contact');
  const coils = allItems.filter(i => i.category === 'coil');
  const structure = allItems.filter(i => i.category === 'structure');
  const functionBlocks = allItems.filter(i => i.category === 'function_block');

  return (
    <div className="w-40 h-full bg-[var(--color-surface-800)] border-r border-[var(--color-surface-600)] p-2 overflow-y-auto flex-shrink-0" data-ld-toolbox>
      <h2 className="text-xs font-bold text-[var(--color-surface-100)] mb-2 px-1">Toolbox</h2>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search the toolbox"
        placeholder="Search"
        className="mb-3 w-full rounded border border-[var(--border-color)] bg-[var(--color-surface-700)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--color-accent-blue)] focus:outline-none"
      />

      <ToolboxSection title="Contacts" items={contacts} onInsert={onInsert} />
      <ToolboxSection title="Coils" items={coils} onInsert={onInsert} />
      <ToolboxSection title="Structure" items={structure} onInsert={onInsert} />
      <ToolboxSection title="Function Blocks" items={functionBlocks} onInsert={onInsert} />
      {allItems.length === 0 ? <p className="px-1 text-[10px] text-[var(--color-surface-300)]">Nothing matches.</p> : null}

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t border-[var(--color-surface-700)]">
        <p className="text-[9px] text-[var(--color-surface-300)] leading-relaxed">
          Press an item to insert it at the cursor, or drag it onto the grid. Use Branch to create parallel paths.
        </p>
      </div>
    </div>
  );
}
