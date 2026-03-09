/**
 * FBDToolbox - Sidebar with draggable blocks for FBD editor
 * 
 * Categorized palette of function blocks, logic gates, etc.
 */

import { useState, type ReactElement } from 'react';
import { ChevronDown, ChevronRight, Timer, Binary, Hash, GitBranch, Calculator, ToggleLeft, Zap, ArrowRightLeft, Repeat, Gauge, Database, Type, Radio } from 'lucide-react';
import { getBlockCategories } from '../../catalog/blockCatalog';

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

const BLOCK_CATEGORIES: BlockCategory[] = getBlockCategories().map((category) => ({
  ...category,
  icon: CATEGORY_ICONS[category.name] ?? <Database size={14} />,
}));

// =============================================================================
// Component
// =============================================================================

export default function FBDToolbox() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Timers', 'Logic Gates']) // Default expanded
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

  const onDragStart = (event: React.DragEvent, blockType: string) => {
    event.dataTransfer.setData('application/zplc-block', blockType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-48 h-full bg-slate-800 border-r border-slate-600 overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-600 bg-slate-700">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Blocks
        </span>
      </div>

      {/* Categories */}
      <div className="py-1">
        {BLOCK_CATEGORIES.map((category) => {
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

              {/* Blocks */}
              {isExpanded && (
                <div className="pb-1">
                  {category.blocks.map((block) => (
                    <div
                      key={block}
                      draggable
                      onDragStart={(e) => onDragStart(e, block)}
                      className="mx-2 my-0.5 px-2 py-1 rounded text-xs font-mono text-slate-200 
                                 bg-slate-700 hover:bg-slate-600 cursor-grab active:cursor-grabbing
                                 border border-transparent hover:border-slate-500 transition-colors"
                    >
                      {block}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Special blocks section */}
      <div className="border-t border-slate-600 py-1">
        <div className="px-3 py-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            I/O
          </span>
        </div>
        {['constant', 'variable', 'input', 'output'].map((block) => (
          <div
            key={block}
            draggable
            onDragStart={(e) => onDragStart(e, block)}
            className="mx-2 my-0.5 px-2 py-1 rounded text-xs font-mono text-slate-200 
                       bg-slate-700 hover:bg-slate-600 cursor-grab active:cursor-grabbing
                       border border-transparent hover:border-slate-500 transition-colors"
          >
            {block.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Help text */}
      <div className="px-3 py-2 border-t border-slate-600">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Drag blocks onto the canvas. Connect outputs (green) to inputs (blue).
        </p>
      </div>
    </div>
  );
}
