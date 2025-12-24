/**
 * SFCToolbox - Sidebar with draggable elements for SFC editor
 * 
 * Provides Steps, Transitions, and other SFC elements for drag-and-drop.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Circle, ArrowDown, Play, GitBranch } from 'lucide-react';

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
  {
    name: 'Branches',
    icon: <GitBranch size={14} />,
    elements: [
      { type: 'divergence_or', label: 'OR Divergence', description: 'Alternative paths' },
      { type: 'convergence_or', label: 'OR Convergence', description: 'Alternative join' },
      { type: 'divergence_and', label: 'AND Divergence', description: 'Parallel paths' },
      { type: 'convergence_and', label: 'AND Convergence', description: 'Parallel join' },
    ],
  },
  {
    name: 'Special',
    icon: <Play size={14} />,
    elements: [
      { type: 'jump', label: 'Jump', description: 'Jump to another step' },
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
    <div className="w-48 h-full bg-slate-800 border-r border-slate-600 overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-600 bg-slate-700">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
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
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-700 transition-colors"
              >
                <span className="text-slate-400">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <span className="text-slate-400">{category.icon}</span>
                <span className="text-xs text-slate-300 font-medium">
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
                                 bg-slate-700 hover:bg-slate-600 cursor-grab active:cursor-grabbing
                                 border border-transparent hover:border-slate-500 transition-colors"
                      title={element.description}
                    >
                      <div className="text-slate-200 font-medium">{element.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
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
      <div className="px-3 py-2 border-t border-slate-600">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Drag elements onto the canvas. Connect Steps with Transitions.
          Double-click to edit names and conditions.
        </p>
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-slate-600">
        <div className="text-[10px] text-slate-500 mb-1">Action Qualifiers:</div>
        <div className="grid grid-cols-2 gap-1 text-[9px]">
          <div className="text-slate-400"><span className="font-mono bg-slate-700 px-1 rounded">N</span> Non-stored</div>
          <div className="text-slate-400"><span className="font-mono bg-slate-700 px-1 rounded">S</span> Set</div>
          <div className="text-slate-400"><span className="font-mono bg-slate-700 px-1 rounded">R</span> Reset</div>
          <div className="text-slate-400"><span className="font-mono bg-slate-700 px-1 rounded">P</span> Pulse</div>
        </div>
      </div>
    </div>
  );
}
