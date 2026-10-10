/** Input and output pins of the project. */

import {
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  IOPinConfig,
} from '../../types';
import type { SectionProps } from './settingsSectionProps';

export function IOSection({ config, updateConfig }: SectionProps) {
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

  const addAnalogInput = () => {
    // Find next available word offset (heuristic: count existing analog inputs * 2)
    const analogInputs = inputs.filter(i => i.address.includes('%IW'));
    const nextOffset = 4 + (analogInputs.length * 2); // Start at %IW4
    const nextChannel = analogInputs.length;

    const newInput: IOPinConfig = {
      name: `AnalogIn${nextChannel}`,
      address: `%IW${nextOffset}`,
      type: 'INT',
      channel: nextChannel,
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

  const addAnalogOutput = () => {
    // Find next available word offset
    const analogOutputs = outputs.filter(o => o.address.includes('%QW'));
    const nextOffset = analogOutputs.length * 2; // Start at %QW0
    const nextChannel = analogOutputs.length;

    const newOutput: IOPinConfig = {
      name: `AnalogOut${nextChannel}`,
      address: `%QW${nextOffset}`,
      type: 'INT',
      channel: nextChannel,
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
          <div className="flex gap-2">
            <button
              onClick={addInput}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
              title="Add Digital Input (BOOL)"
            >
              <Plus size={12} />
              Digital
            </button>
            <button
              onClick={addAnalogInput}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
              title="Add Analog Input (INT)"
            >
              <Plus size={12} />
              Analog
            </button>
          </div>
        </div>
        {inputs.length === 0 ? (
          <p className="text-xs text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
            No inputs configured. Click "Add" to map a GPIO pin.
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
          <div className="flex gap-2">
            <button
              onClick={addOutput}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
              title="Add Digital Output (BOOL)"
            >
              <Plus size={12} />
              Digital
            </button>
            <button
              onClick={addAnalogOutput}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
              title="Add Analog Output (INT)"
            >
              <Plus size={12} />
              Analog
            </button>
          </div>
        </div>
        {outputs.length === 0 ? (
          <p className="text-xs text-[var(--color-surface-400)] text-center py-4 bg-[var(--color-surface-700)] rounded">
            No outputs configured. Click "Add" to map a GPIO pin.
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
        <div className="col-span-1">Chan</div>
        <div className="col-span-1">Pin</div>
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
          <div className="col-span-1">
            <input
              type="number"
              value={item.channel ?? ''}
              onChange={(e) => onUpdate(index, { channel: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="#"
              min={0}
              max={16}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none placeholder:text-[var(--color-surface-500)]"
            />
          </div>
          <div className="col-span-1">
            <input
              type="number"
              value={item.pin ?? ''}
              onChange={(e) => onUpdate(index, { pin: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="IO"
              min={0}
              max={100}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none placeholder:text-[var(--color-surface-500)]"
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
