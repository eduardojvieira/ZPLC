/**
 * SFCToolbox - Sidebar with draggable elements for SFC editor
 * 
 * Provides Steps, Transitions, and other SFC elements for drag-and-drop.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Circle, ArrowDown } from 'lucide-react';

// =============================================================================
// Element Categories
// =============================================================================

interface SFCElementCategory {
  name: string;
  icon: React.ReactNode;
  elements: Array<{
    type: string;
    label: string;
    description: string;
  }>;
}

const SFC_CATEGORIES: SFCElementCategory[] = [
  {
    name: 'Steps',
    icon: <Circle size={14} />,
    elements: [
      { type: 'step', label: 'Step', description: 'Regular step state' },
      { type: 'initial_step', label: 'Initial Step', description: 'Starting state (double border)' },
    ],
  },
  {
    name: 'Transitions',
    icon: <ArrowDown size={14} />,
    elements: [
      { type: 'transition', label: 'Transition', description: 'Condition between steps' },
    ],
  },
];

// =============================================================================
// Component
// =============================================================================

export default function SFCToolbox() {
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

      {/* Categories */}
      <div className="py-1">
        {SFC_CATEGORIES.map((category) => {
          const isExpanded = expandedCategories.has(category.name);
          
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

              {/* Elements */}
              {isExpanded && (
                <div className="pb-1">
                  {category.elements.map((element) => (
                    <div
                      key={element.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, element.type)}
                      className="mx-2 my-0.5 px-2 py-1.5 rounded text-xs 
                                 bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] cursor-grab active:cursor-grabbing
                                 border border-transparent hover:border-[var(--color-accent-blue)] transition-colors"
                      title={element.description}
                    >
                      <div className="text-[var(--text-primary)] font-medium">{element.label}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {element.description}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          Drag elements onto the canvas. Connect Steps with Transitions.
          Double-click to edit names and conditions.
        </p>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <div className="text-[10px] text-[var(--text-tertiary)] mb-1">Action Qualifiers:</div>
        <div className="grid grid-cols-2 gap-1 text-[9px]">
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">N</span> Non-stored</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">S</span> Set</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">R</span> Reset</div>
          <div className="text-[var(--text-tertiary)]"><span className="font-mono bg-[var(--color-surface-700)] px-1 rounded">P</span> Pulse</div>
        </div>
      </div>
    </div>
  );
}
