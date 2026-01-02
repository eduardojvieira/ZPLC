/**
 * ProjectSettings Component
 * 
 * Complete project configuration editor for zplc.json.
 * Sections:
 * - Project Metadata (name, version, description, author)
 * - Target Hardware (board, cpu, clock_mhz)
 * - Compiler Settings (optimization, debug, warnings)
 * - I/O Mapping (inputs, outputs)
 * - Task Configuration (cyclic, event, freewheeling)
 * - Build Settings (outDir, entryPoints)
 */

import { useState } from 'react';
import {
  Settings,
  Clock,
  Zap,
  Play,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Wrench,
  Cable,
  Package,
  User,
  FileText,
} from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';
import type {
  TaskDefinition,
  TaskTrigger,
  IOPinConfig,
  TargetConfig,
  CompilerConfig,
  ZPLCProjectConfig,
  FileTreeNode,
} from '../../types';

// =============================================================================
// Common Board Options (for dropdown)
// =============================================================================

const BOARD_OPTIONS = [
  { value: '', label: 'Select a board...' },
  { value: 'rpi_pico', label: 'Raspberry Pi Pico (RP2040)' },
  { value: 'rpi_pico_w', label: 'Raspberry Pi Pico W (RP2040 + WiFi)' },
  { value: 'arduino_giga_r1', label: 'Arduino GIGA R1 (STM32H747)' },
  { value: 'arduino_opta', label: 'Arduino Opta (Industrial PLC)' },
  { value: 'nucleo_h743zi', label: 'STM32 Nucleo H743ZI' },
  { value: 'nucleo_f446re', label: 'STM32 Nucleo F446RE' },
  { value: 'esp32s3_devkitc', label: 'ESP32-S3 DevKitC' },
  { value: 'esp32_devkitc_wroom', label: 'ESP32 DevKitC WROOM' },
  { value: 'nrf52840dk', label: 'Nordic nRF52840 DK' },
  { value: 'mps2_an385', label: 'ARM MPS2+ AN385 (QEMU)' },
  { value: 'custom', label: 'Custom (enter manually)' },
];

// =============================================================================
// Main Component
// =============================================================================

export function ProjectSettings() {
  const { projectConfig, saveProjectConfig, isVirtualProject } = useIDEStore();
  
  // Section collapse state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    metadata: true,
    target: true,
    compiler: false,
    io: true,
    tasks: true,
    build: false,
  });

  if (!projectConfig) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface-900)]">
        <p className="text-[var(--color-surface-400)]">No project configuration loaded</p>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Generic update helper for nested config
  const updateConfig = (updates: Partial<ZPLCProjectConfig>) => {
    useIDEStore.setState({
      projectConfig: { ...projectConfig, ...updates },
    });
  };

  // Save to disk
  const handleSave = async () => {
    await saveProjectConfig();
  };

  return (
    <div className="h-full overflow-auto bg-[var(--color-surface-900)] p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-accent-blue)]/20">
              <Settings className="text-[var(--color-accent-blue)]" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--color-surface-100)]">
                Project Settings
              </h1>
              <p className="text-sm text-[var(--color-surface-400)]">
                Configure hardware target, I/O mapping, and runtime behavior
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            className={`px-4 py-2 text-sm rounded font-medium transition-colors ${
              isVirtualProject 
                ? 'bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]' 
                : 'bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-white'
            }`}
            title={isVirtualProject ? 'Virtual project - changes are in-memory only' : 'Save changes to zplc.json'}
          >
            {isVirtualProject ? 'Apply (Virtual)' : 'Save Config'}
          </button>
        </div>

        {/* Settings Sections */}
        <div className="space-y-4">
          {/* Virtual Project Warning */}
          {isVirtualProject && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-accent-yellow)]/10 border border-[var(--color-accent-yellow)]/30">
              <Settings size={18} className="text-[var(--color-accent-yellow)] shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-[var(--color-accent-yellow)]">Virtual Project</p>
                <p className="text-[var(--color-surface-300)] text-xs mt-1">
                  This is an example or in-memory project. Changes are stored temporarily and will be lost when you close the IDE.
                  To persist changes, use <strong>File → Open Folder</strong> to work with a real directory.
                </p>
              </div>
            </div>
          )}
          {/* ================= METADATA ================= */}
          <SettingsSection
            title="Project Metadata"
            icon={<FileText size={16} />}
            isExpanded={expandedSections.metadata}
            onToggle={() => toggleSection('metadata')}
          >
            <MetadataSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= TARGET HARDWARE ================= */}
          <SettingsSection
            title="Target Hardware"
            icon={<Cpu size={16} />}
            isExpanded={expandedSections.target}
            onToggle={() => toggleSection('target')}
            badge={projectConfig.target?.board}
          >
            <TargetSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= COMPILER ================= */}
          <SettingsSection
            title="Compiler Settings"
            icon={<Wrench size={16} />}
            isExpanded={expandedSections.compiler}
            onToggle={() => toggleSection('compiler')}
          >
            <CompilerSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= I/O MAPPING ================= */}
          <SettingsSection
            title="I/O Mapping"
            icon={<Cable size={16} />}
            isExpanded={expandedSections.io}
            onToggle={() => toggleSection('io')}
            badge={`${projectConfig.io?.inputs?.length || 0} IN / ${projectConfig.io?.outputs?.length || 0} OUT`}
          >
            <IOSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= TASKS ================= */}
          <SettingsSection
            title="Task Configuration"
            icon={<Zap size={16} />}
            isExpanded={expandedSections.tasks}
            onToggle={() => toggleSection('tasks')}
            badge={`${projectConfig.tasks.length} task${projectConfig.tasks.length !== 1 ? 's' : ''}`}
          >
            <TasksSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>

          {/* ================= BUILD ================= */}
          <SettingsSection
            title="Build Settings"
            icon={<Package size={16} />}
            isExpanded={expandedSections.build}
            onToggle={() => toggleSection('build')}
          >
            <BuildSection config={projectConfig} updateConfig={updateConfig} />
          </SettingsSection>
        </div>

        {/* Summary Footer */}
        <div className="mt-6 bg-[var(--color-surface-700)]/50 rounded-lg p-4 border border-[var(--color-surface-600)]">
          <div className="text-sm text-[var(--color-surface-300)]">
            <strong className="text-[var(--color-surface-100)]">Configuration Summary:</strong>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                Project: <span className="text-[var(--color-accent-blue)]">{projectConfig.name}</span> v{projectConfig.version}
                {projectConfig.author && <span className="text-[var(--color-surface-400)]"> by {projectConfig.author}</span>}
              </li>
              {projectConfig.target?.board && (
                <li>
                  Target: <span className="text-[var(--color-accent-green)]">{projectConfig.target.board}</span>
                  {projectConfig.target.clock_mhz && ` @ ${projectConfig.target.clock_mhz} MHz`}
                </li>
              )}
              <li>
                I/O: <span className="text-[var(--color-accent-yellow)]">{projectConfig.io?.inputs?.length || 0}</span> inputs, 
                <span className="text-[var(--color-accent-yellow)]"> {projectConfig.io?.outputs?.length || 0}</span> outputs
              </li>
              <li>
                Tasks: <span className="text-[var(--color-accent-green)]">{projectConfig.tasks.length}</span> configured
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Collapsible Section Wrapper
// =============================================================================

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}

function SettingsSection({ title, icon, isExpanded, onToggle, badge, children }: SettingsSectionProps) {
  return (
    <div className="bg-[var(--color-surface-800)] rounded-lg border border-[var(--color-surface-600)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-surface-700)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-accent-blue)]">{icon}</span>
          <span className="text-sm font-medium text-[var(--color-surface-200)]">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-surface-600)] text-[var(--color-surface-300)]">
              {badge}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown size={16} className="text-[var(--color-surface-400)]" />
        ) : (
          <ChevronRight size={16} className="text-[var(--color-surface-400)]" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-[var(--color-surface-600)]">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// METADATA SECTION
// =============================================================================

interface SectionProps {
  config: ZPLCProjectConfig;
  updateConfig: (updates: Partial<ZPLCProjectConfig>) => void;
}

function MetadataSection({ config, updateConfig }: SectionProps) {
  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Project Name
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => {
              updateConfig({ name: e.target.value });
              useIDEStore.setState({ projectName: e.target.value });
            }}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Version
          </label>
          <input
            type="text"
            value={config.version}
            onChange={(e) => updateConfig({ version: e.target.value })}
            placeholder="1.0.0"
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          <User size={10} className="inline mr-1" />
          Author
        </label>
        <input
          type="text"
          value={config.author || ''}
          onChange={(e) => updateConfig({ author: e.target.value || undefined })}
          placeholder="Your name or organization"
          className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)]"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          Description
        </label>
        <textarea
          value={config.description || ''}
          onChange={(e) => updateConfig({ description: e.target.value || undefined })}
          placeholder="Brief description of the project..."
          rows={2}
          className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)] resize-none"
        />
      </div>
    </div>
  );
}

// =============================================================================
// TARGET HARDWARE SECTION
// =============================================================================

function TargetSection({ config, updateConfig }: SectionProps) {
  // Target is optional in config, so we use a partial type internally
  const target: Partial<TargetConfig> = config.target || {};
  const [customBoard, setCustomBoard] = useState(
    !BOARD_OPTIONS.find(opt => opt.value === target.board) && target.board ? true : false
  );

  const updateTarget = (updates: Partial<TargetConfig>) => {
    const newTarget = { ...target, ...updates };
    // Only set target if at least board is defined
    if (newTarget.board) {
      updateConfig({ target: newTarget as TargetConfig });
    } else {
      updateConfig({ target: undefined });
    }
  };

  const handleBoardChange = (value: string) => {
    if (value === 'custom') {
      setCustomBoard(true);
      updateTarget({ board: '' });
    } else {
      setCustomBoard(false);
      updateTarget({ board: value });
    }
  };

  return (
    <div className="pt-4 space-y-4">
      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          Target Board
        </label>
        {customBoard ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={target.board || ''}
              onChange={(e) => updateTarget({ board: e.target.value })}
              placeholder="e.g., my_custom_board"
              className="flex-1 px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
            />
            <button
              onClick={() => setCustomBoard(false)}
              className="px-3 py-2 text-xs bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] rounded"
            >
              Use List
            </button>
          </div>
        ) : (
          <select
            value={target.board || ''}
            onChange={(e) => handleBoardChange(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)]"
          >
            {BOARD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            CPU (optional)
          </label>
          <input
            type="text"
            value={target.cpu || ''}
            onChange={(e) => updateTarget({ cpu: e.target.value || undefined })}
            placeholder="e.g., rp2040, stm32h747"
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            <Clock size={10} className="inline mr-1" />
            Clock Speed (MHz)
          </label>
          <input
            type="number"
            value={target.clock_mhz || ''}
            onChange={(e) => updateTarget({ clock_mhz: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="e.g., 133"
            min={1}
            max={1000}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)]"
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPILER SECTION
// =============================================================================

function CompilerSection({ config, updateConfig }: SectionProps) {
  const compiler = config.compiler || {};

  const updateCompiler = (updates: Partial<CompilerConfig>) => {
    updateConfig({ compiler: { ...compiler, ...updates } });
  };

  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Optimization Level
          </label>
          <select
            value={compiler.optimization || 'none'}
            onChange={(e) => updateCompiler({ optimization: e.target.value as 'none' | 'speed' | 'size' })}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          >
            <option value="none">None (fastest compile)</option>
            <option value="speed">Optimize for Speed</option>
            <option value="size">Optimize for Size</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Warnings
          </label>
          <select
            value={compiler.warnings || 'default'}
            onChange={(e) => updateCompiler({ warnings: e.target.value as 'none' | 'default' | 'all' })}
            className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          >
            <option value="none">Suppress All</option>
            <option value="default">Default</option>
            <option value="all">All Warnings</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="debug-mode"
          checked={compiler.debug || false}
          onChange={(e) => updateCompiler({ debug: e.target.checked })}
          className="w-4 h-4 rounded border-[var(--color-surface-500)] bg-[var(--color-surface-700)] text-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]"
        />
        <label htmlFor="debug-mode" className="text-sm text-[var(--color-surface-200)]">
          Enable debug symbols
          <span className="block text-xs text-[var(--color-surface-400)]">
            Include source mapping for debugging (increases binary size)
          </span>
        </label>
      </div>
    </div>
  );
}

// =============================================================================
// I/O MAPPING SECTION
// =============================================================================

function IOSection({ config, updateConfig }: SectionProps) {
  const io = config.io || { inputs: [], outputs: [] };
  const inputs = io.inputs || [];
  const outputs = io.outputs || [];

  const updateIO = (updates: { inputs?: IOPinConfig[]; outputs?: IOPinConfig[] }) => {
    updateConfig({ io: { ...io, ...updates } });
  };

  const addInput = () => {
    const nextIndex = inputs.length;
    const newInput: IOPinConfig = {
      name: `Input${nextIndex}`,
      address: `%I0.${nextIndex}`,
      type: 'BOOL',
    };
    updateIO({ inputs: [...inputs, newInput] });
  };

  const addOutput = () => {
    const nextIndex = outputs.length;
    const newOutput: IOPinConfig = {
      name: `Output${nextIndex}`,
      address: `%Q0.${nextIndex}`,
      type: 'BOOL',
    };
    updateIO({ outputs: [...outputs, newOutput] });
  };

  const updateInput = (index: number, updates: Partial<IOPinConfig>) => {
    const newInputs = [...inputs];
    newInputs[index] = { ...newInputs[index], ...updates };
    updateIO({ inputs: newInputs });
  };

  const updateOutput = (index: number, updates: Partial<IOPinConfig>) => {
    const newOutputs = [...outputs];
    newOutputs[index] = { ...newOutputs[index], ...updates };
    updateIO({ outputs: newOutputs });
  };

  const removeInput = (index: number) => {
    updateIO({ inputs: inputs.filter((_, i) => i !== index) });
  };

  const removeOutput = (index: number) => {
    updateIO({ outputs: outputs.filter((_, i) => i !== index) });
  };

  return (
    <div className="pt-4 space-y-6">
      {/* INPUTS */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--color-accent-green)]">
            Inputs (%I)
          </label>
          <button
            onClick={addInput}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
          >
            <Plus size={12} />
            Add Input
          </button>
        </div>
        {inputs.length === 0 ? (
          <p className="text-xs text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
            No inputs configured. Click "Add Input" to map a GPIO pin.
          </p>
        ) : (
          <IOTable
            items={inputs}
            onUpdate={updateInput}
            onRemove={removeInput}
            addressPrefix="%I"
          />
        )}
      </div>

      {/* OUTPUTS */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--color-accent-yellow)]">
            Outputs (%Q)
          </label>
          <button
            onClick={addOutput}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
          >
            <Plus size={12} />
            Add Output
          </button>
        </div>
        {outputs.length === 0 ? (
          <p className="text-xs text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
            No outputs configured. Click "Add Output" to map a GPIO pin.
          </p>
        ) : (
          <IOTable
            items={outputs}
            onUpdate={updateOutput}
            onRemove={removeOutput}
            addressPrefix="%Q"
          />
        )}
      </div>
    </div>
  );
}

// I/O Table sub-component
interface IOTableProps {
  items: IOPinConfig[];
  onUpdate: (index: number, updates: Partial<IOPinConfig>) => void;
  onRemove: (index: number) => void;
  addressPrefix: string;
}

function IOTable({ items, onUpdate, onRemove }: IOTableProps) {
  return (
    <div className="bg-[var(--color-surface-700)] rounded border border-[var(--color-surface-600)] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--color-surface-600)] text-xs text-[var(--color-surface-300)] font-medium">
        <div className="col-span-3">Name</div>
        <div className="col-span-2">Address</div>
        <div className="col-span-2">GPIO Pin</div>
        <div className="col-span-2">Type</div>
        <div className="col-span-2">Description</div>
        <div className="col-span-1"></div>
      </div>
      {/* Rows */}
      {items.map((item, index) => (
        <div
          key={index}
          className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-[var(--color-surface-600)] items-center"
        >
          <div className="col-span-3">
            <input
              type="text"
              value={item.name}
              onChange={(e) => onUpdate(index, { name: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <input
              type="text"
              value={item.address}
              onChange={(e) => onUpdate(index, { address: e.target.value })}
              placeholder="%I0.0"
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-accent-blue)] font-mono focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <input
              type="number"
              value={item.pin ?? ''}
              onChange={(e) => onUpdate(index, { pin: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="GPIO"
              min={0}
              max={100}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <select
              value={item.type || 'BOOL'}
              onChange={(e) => onUpdate(index, { type: e.target.value as 'BOOL' | 'INT' | 'REAL' })}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
            >
              <option value="BOOL">BOOL</option>
              <option value="INT">INT</option>
              <option value="REAL">REAL</option>
            </select>
          </div>
          <div className="col-span-2">
            <input
              type="text"
              value={item.description || ''}
              onChange={(e) => onUpdate(index, { description: e.target.value || undefined })}
              placeholder="..."
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none placeholder:text-[var(--color-surface-500)]"
            />
          </div>
          <div className="col-span-1 flex justify-end">
            <button
              onClick={() => onRemove(index)}
              className="p-1 rounded hover:bg-[var(--color-surface-500)] text-[var(--color-accent-red)]"
              title="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// TASKS SECTION
// =============================================================================

/**
 * Get list of available program files from the file tree.
 * Programs are .st files or visual editor files (.fbd.json, .ld.json, .sfc.json)
 * This searches the fileTree recursively, not just loaded files.
 * 
 * Returns filenames with simplified extensions (e.g., "main.st", "main.fbd")
 * so users can choose which language/file to compile.
 */
function getAvailablePrograms(fileTree: FileTreeNode | null): string[] {
  if (!fileTree) return [];
  
  const programs: string[] = [];
  const programExtensions = ['.st', '.il', '.fbd.json', '.ld.json', '.sfc.json'];
  
  // Map .xxx.json to .xxx for cleaner display
  const simplifyExtension = (filename: string): string => {
    if (filename.endsWith('.fbd.json')) return filename.replace('.fbd.json', '.fbd');
    if (filename.endsWith('.ld.json')) return filename.replace('.ld.json', '.ld');
    if (filename.endsWith('.sfc.json')) return filename.replace('.sfc.json', '.sfc');
    return filename;
  };
  
  function collectPrograms(node: FileTreeNode) {
    if (node.type === 'file' && node.name) {
      const isProgram = programExtensions.some(ext => node.name.endsWith(ext));
      if (isProgram) {
        const displayName = simplifyExtension(node.name);
        if (!programs.includes(displayName)) {
          programs.push(displayName);
        }
      }
    }
    
    // Recurse into directories
    if (node.children) {
      for (const child of node.children) {
        collectPrograms(child);
      }
    }
  }
  
  collectPrograms(fileTree);
  return programs.sort();
}

function TasksSection({ config, updateConfig }: SectionProps) {
  const { fileTree } = useIDEStore();
  const tasks = config.tasks;
  const availablePrograms = getAvailablePrograms(fileTree);

  const addTask = () => {
    const newTask: TaskDefinition = {
      name: `Task${tasks.length + 1}`,
      trigger: 'cyclic',
      interval: 100,
      priority: 5,
      programs: [],
    };
    updateConfig({ tasks: [...tasks, newTask] });
  };

  const updateTask = (index: number, updates: Partial<TaskDefinition>) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    updateConfig({ tasks: newTasks });
  };

  const removeTask = (index: number) => {
    updateConfig({ tasks: tasks.filter((_, i) => i !== index) });
  };

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--color-surface-400)]">
          Define how and when your programs execute (IEC 61131-3 task model)
        </p>
        <button
          onClick={addTask}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
        >
          <Plus size={12} />
          Add Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
          No tasks configured. Add a task to define program execution.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <TaskCard
              key={index}
              task={task}
              availablePrograms={availablePrograms}
              onUpdate={(updates) => updateTask(index, updates)}
              onRemove={() => removeTask(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Task Card sub-component
interface TaskCardProps {
  task: TaskDefinition;
  availablePrograms: string[];
  onUpdate: (updates: Partial<TaskDefinition>) => void;
  onRemove: () => void;
}

function TaskCard({ task, availablePrograms, onUpdate, onRemove }: TaskCardProps) {
  // Currently only one program per task is supported by the runtime
  // Programs are stored WITH extension (e.g., "main.st", "main.fbd")
  const selectedProgram = task.programs[0] || '';
  
  return (
    <div className="bg-[var(--color-surface-700)] rounded-lg p-3 border border-[var(--color-surface-500)]">
      <div className="flex items-center justify-between mb-3">
        <input
          type="text"
          value={task.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="text-sm font-medium bg-transparent text-[var(--color-surface-100)] border-b border-transparent focus:border-[var(--color-accent-blue)] focus:outline-none"
        />
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-[var(--color-surface-600)] text-[var(--color-accent-red)]"
          title="Remove Task"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {/* Trigger */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Trigger
          </label>
          <select
            value={task.trigger}
            onChange={(e) => onUpdate({ trigger: e.target.value as TaskTrigger })}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          >
            <option value="cyclic">Cyclic</option>
            <option value="event">Event</option>
            <option value="freewheeling">Freewheeling</option>
          </select>
        </div>

        {/* Interval */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            <Clock size={10} className="inline mr-1" />
            Interval (ms)
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={task.interval || 100}
            onChange={(e) => onUpdate({ interval: parseInt(e.target.value) || 100 })}
            disabled={task.trigger !== 'cyclic'}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Priority
          </label>
          <input
            type="number"
            min={0}
            max={255}
            value={task.priority}
            onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 1 })}
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
          />
        </div>

        {/* Watchdog */}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-1">
            Watchdog (ms)
          </label>
          <input
            type="number"
            min={0}
            max={10000}
            value={task.watchdog || ''}
            onChange={(e) => onUpdate({ watchdog: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="Optional"
            className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none placeholder:text-[var(--color-surface-500)]"
          />
        </div>
      </div>

      {/* Program */}
      <div className="mt-3">
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          <Play size={10} className="inline mr-1" />
          Program
        </label>
        <select
          value={selectedProgram}
          onChange={(e) => onUpdate({
            programs: e.target.value ? [e.target.value] : []
          })}
          className="w-full px-2 py-1 text-sm bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
        >
          <option value="">Select a program...</option>
          {availablePrograms.map((prog) => (
            <option key={prog} value={prog}>
              {prog}
            </option>
          ))}
        </select>
        {availablePrograms.length === 0 && (
          <p className="mt-1 text-xs text-[var(--color-accent-yellow)]">
            No program files found. Create a .st, .fbd, .ld, or .sfc file first.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// BUILD SECTION
// =============================================================================

function BuildSection({ config, updateConfig }: SectionProps) {
  const build = config.build || {};

  const updateBuild = (updates: Partial<{ outDir?: string; entryPoints?: string[] }>) => {
    updateConfig({ build: { ...build, ...updates } });
  };

  return (
    <div className="pt-4 space-y-4">
      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          Output Directory
        </label>
        <input
          type="text"
          value={build.outDir || ''}
          onChange={(e) => updateBuild({ outDir: e.target.value || undefined })}
          placeholder="build (default)"
          className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)]"
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-1">
          Entry Points (comma-separated, optional)
        </label>
        <input
          type="text"
          value={build.entryPoints?.join(', ') || ''}
          onChange={(e) => updateBuild({
            entryPoints: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : undefined
          })}
          placeholder="Auto-detected from tasks"
          className="w-full px-3 py-2 bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-blue)] placeholder:text-[var(--color-surface-500)]"
        />
        <p className="mt-1 text-xs text-[var(--color-surface-400)]">
          Override: explicitly specify entry point files. Leave empty to auto-detect from task programs.
        </p>
      </div>
    </div>
  );
}
