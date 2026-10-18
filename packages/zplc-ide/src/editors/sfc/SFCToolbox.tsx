/**
 * SFCToolbox - Sidebar with the elements of the SFC editor
 * 
 * Provides Steps and Transitions. An element is a button: dragging it onto the canvas places it there, and pressing it
 * (Enter, Space or a click) inserts it after the selected element (LNG-012). The search box filters the elements.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Circle, ArrowDown } from 'lucide-react';
import { SFC_PALETTE, type SFCPaletteElement } from '../../models/sfcSupport';
import { Button, TextField } from '../../ui';
import { filterItems } from '../picker';

/** The smallest text of the scale (UX-006): captions and notes. */
const CAPTION = 'text-[length:var(--font-size-caption)]';

// =============================================================================
// Element Categories
// =============================================================================

interface SFCElementCategory {
  name: SFCPaletteElement['category'];
  icon: React.ReactNode;
  elements: SFCPaletteElement[];
}

// The elements come from the table that the transpiler's coverage is stated in (LNG-007)
const SFC_CATEGORIES: SFCElementCategory[] = [
  { name: 'Steps', icon: <Circle size={14} /> },
  { name: 'Transitions', icon: <ArrowDown size={14} /> },
].map((category) => ({ ...category, elements: SFC_PALETTE.filter((element) => element.category === category.name) } as SFCElementCategory));

// =============================================================================
// Component
// =============================================================================

interface SFCToolboxProps {
  /** An element was pressed: it is inserted after the selected element. */
  onInsert?: (elementType: SFCPaletteElement['type']) => void;
}

export default function SFCToolbox({ onInsert }: SFCToolboxProps) {
  const [query, setQuery] = useState('');
  const found = new Set(filterItems(SFC_PALETTE.map((element) => ({ id: element.type, label: element.label, detail: element.description, group: element.category })), query).map((item) => item.id));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Steps', 'Transitions']) // Default expanded
  );

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

  const onDragStart = (event: React.DragEvent, elementType: string) => {
    event.dataTransfer.setData('application/zplc-sfc', elementType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="zplc-visual-toolbox w-48 h-full border-r overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] bg-[var(--color-surface-700)]">
        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          SFC Elements
        </span>
      </div>

      <div className="px-2 pt-2">
        <TextField
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search the elements"
          placeholder="Search"
          className="w-full"
        />
      </div>

      {/* Categories */}
      <div className="py-1">
        {SFC_CATEGORIES.map((category) => ({ ...category, elements: category.elements.filter((element) => found.has(element.type)) })).filter((category) => category.elements.length > 0).map((category) => {
          const isExpanded = query.trim() !== '' || expandedCategories.has(category.name);
          
          return (
            <div key={category.name} className="select-none">
              {/* Category header */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleCategory(category.name)}
                className="w-full justify-start gap-2 px-3 py-1.5 text-left"
              >
                <span className="text-[var(--text-tertiary)]">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="text-[var(--text-tertiary)]">{category.icon}</span>
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {category.name}
                </span>
              </Button>

              {/* Elements */}
              {isExpanded && (
                <div className="pb-1">
                  {category.elements.map((element) => (
                    <Button
                      size="sm"
                      key={element.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, element.type)}
                      onClick={() => onInsert?.(element.type)}
                      data-sfc-toolbox-item={element.type}
                      aria-label={`Insert ${element.label}`}
                      tooltip={`${element.description}: press to insert after the selected element, or drag onto the canvas`}
                      className="mx-2 my-0.5 w-[calc(100%-1rem)] flex-col items-start justify-center whitespace-normal px-2 py-1.5 text-left text-xs
                                 bg-[var(--color-surface-700)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] cursor-grab active:cursor-grabbing
                                 border border-transparent hover:border-[var(--color-accent-blue)]"
                    >
                      <div className="text-[var(--text-primary)] font-medium">{element.label}</div>
                      <div className={`${CAPTION} font-normal text-[var(--text-tertiary)] mt-0.5`}>
                        {element.description}
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <p className={`${CAPTION} text-[var(--text-tertiary)] leading-relaxed`}>
          Press an element to insert it after the selected one, or drag it onto the canvas.
          Connect Steps with Transitions, or press C on one. Double-click, or press F2, to edit names and conditions.
        </p>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <div className={`${CAPTION} text-[var(--text-tertiary)] mb-1`}>Action Qualifiers:</div>
        <div className={`grid grid-cols-2 gap-1 ${CAPTION}`}>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">N</span> Non-stored</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">S</span> Set</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">R</span> Reset</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">P</span> Pulse</div>
        </div>
      </div>
    </div>
  );
}
