/**
 * LDToolbox - Draggable Element Palette for Ladder Diagram Editor
 * 
 * Provides drag-and-drop source for:
 * - Contacts (NO, NC, P, N)
 * - Coils (Standard, Negated, Set, Reset)
 * - Structure (Branch for parallel paths)
 * - Function Blocks (TON, TOF, CTU, etc.)
 */

import { getToolboxItems, type LDToolboxItem } from '../../models/ld';

// =============================================================================
// Constants
// =============================================================================

const DRAG_MIME_TYPE = 'application/zplc-ld-element';

// =============================================================================
// Toolbox Item Component
// =============================================================================

interface ToolboxItemProps {
  item: LDToolboxItem;
}

function ToolboxItem({ item }: ToolboxItemProps) {
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
    <div
      draggable
      onDragStart={handleDragStart}
      className={`
        flex flex-col items-center justify-center p-2 
        border-2 rounded cursor-grab active:cursor-grabbing
        transition-colors select-none
        ${getCategoryStyles()}
      `}
      title={item.label}
    >
      <span className="font-mono text-xs font-bold">{item.symbol}</span>
      <span className="text-[9px] text-[var(--color-surface-200)] mt-0.5">{item.label}</span>
    </div>
  );
}

// =============================================================================
// Toolbox Section
// =============================================================================

interface ToolboxSectionProps {
  title: string;
  items: LDToolboxItem[];
}

function ToolboxSection({ title, items }: ToolboxSectionProps) {
  if (items.length === 0) return null;
  
  return (
    <div className="mb-3">
      <h3 className="text-[10px] font-semibold text-[var(--color-surface-300)] uppercase tracking-wider mb-1.5 px-1">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item, idx) => (
          <ToolboxItem key={`${item.type}-${item.fbType || idx}`} item={item} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Toolbox Component
// =============================================================================

export default function LDToolbox() {
  const allItems = getToolboxItems();

  const contacts = allItems.filter(i => i.category === 'contact');
  const coils = allItems.filter(i => i.category === 'coil');
  const structure = allItems.filter(i => i.category === 'structure');
  const functionBlocks = allItems.filter(i => i.category === 'function_block');

  return (
    <div className="w-40 h-full bg-[var(--color-surface-800)] border-r border-[var(--color-surface-600)] p-2 overflow-y-auto flex-shrink-0">
      <h2 className="text-xs font-bold text-[var(--color-surface-100)] mb-3 px-1">Toolbox</h2>

      <ToolboxSection title="Contacts" items={contacts} />
      <ToolboxSection title="Coils" items={coils} />
      <ToolboxSection title="Structure" items={structure} />
      <ToolboxSection title="Function Blocks" items={functionBlocks} />

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t border-[var(--color-surface-700)]">
        <p className="text-[9px] text-[var(--color-surface-300)] leading-relaxed">
          Drag elements onto the grid. Use Branch to create parallel paths.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Export helper for parsing drop data
// =============================================================================

export interface LDDropData {
  type: string;
  fbType?: string;
  category: 'contact' | 'coil' | 'function_block' | 'structure';
  // Move operation fields
  isMove?: boolean;
  elementId?: string;
  fromRow?: number;
  fromCol?: number;
}

export function parseLDDropData(e: React.DragEvent): LDDropData | null {
  const data = e.dataTransfer.getData(DRAG_MIME_TYPE);
  if (!data) return null;

  try {
    return JSON.parse(data) as LDDropData;
  } catch {
    return null;
  }
}

export { DRAG_MIME_TYPE };
