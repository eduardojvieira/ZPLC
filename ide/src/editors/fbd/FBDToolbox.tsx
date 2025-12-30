/**
 * FBDToolbox - Sidebar with draggable blocks for FBD editor
 * 
 * Categorized palette of function blocks, logic gates, etc.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Timer, Binary, Hash, GitBranch, Calculator, ToggleLeft, Zap, ArrowRightLeft, Repeat, Gauge, Database, Type } from 'lucide-react';

// =============================================================================
// Block Categories
// =============================================================================

interface BlockCategory {
  name: string;
  icon: React.ReactNode;
  blocks: string[];
}

const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    name: 'Timers',
    icon: <Timer size={14} />,
    blocks: ['TON', 'TOF', 'TP'],
  },
  {
    name: 'Counters',
    icon: <Hash size={14} />,
    blocks: ['CTU', 'CTD', 'CTUD'],
  },
  {
    name: 'Edge Detection',
    icon: <GitBranch size={14} />,
    blocks: ['R_TRIG', 'F_TRIG'],
  },
  {
    name: 'Bistables',
    icon: <ToggleLeft size={14} />,
    blocks: ['SR', 'RS'],
  },
  {
    name: 'Generators',
    icon: <Repeat size={14} />,
    blocks: ['BLINK', 'PWM', 'PULSE'],
  },
  {
    name: 'Process Control',
    icon: <Gauge size={14} />,
    blocks: ['PID_Compact', 'HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE', 'NORM_X', 'SCALE_X'],
  },
  {
    name: 'System',
    icon: <Database size={14} />,
    blocks: ['FIFO', 'LIFO', 'UPTIME', 'CYCLE_TIME'],
  },
  {
    name: 'Logic Gates',
    icon: <Binary size={14} />,
    blocks: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
  },
  {
    name: 'Comparison',
    icon: <GitBranch size={14} />,
    blocks: ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE'],
  },
  {
    name: 'Math',
    icon: <Calculator size={14} />,
    blocks: ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'ABS', 'SQRT', 'EXPT', 'LN', 'LOG', 'EXP', 'TRUNC', 'ROUND'],
  },
  {
    name: 'Trigonometry',
    icon: <Calculator size={14} />,
    blocks: ['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2'],
  },
  {
    name: 'Selection',
    icon: <GitBranch size={14} />,
    blocks: ['MAX', 'MIN', 'LIMIT', 'SEL', 'MUX'],
  },
  {
    name: 'Bitwise',
    icon: <Zap size={14} />,
    blocks: ['SHL', 'SHR', 'ROL', 'ROR', 'AND_WORD', 'OR_WORD', 'XOR_WORD', 'NOT_WORD', 'AND_DWORD', 'OR_DWORD', 'XOR_DWORD', 'NOT_DWORD'],
  },
  {
    name: 'Type Conversion',
    icon: <ArrowRightLeft size={14} />,
    blocks: ['INT_TO_REAL', 'REAL_TO_INT', 'INT_TO_BOOL', 'BOOL_TO_INT'],
  },
  {
    name: 'Strings',
    icon: <Type size={14} />,
    blocks: ['LEN', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'FIND', 'INSERT', 'DELETE', 'REPLACE', 'COPY', 'CLEAR', 'STRCMP', 'EQ_STRING', 'NE_STRING'],
  },
];

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
