/** Input and output pins of the project. */

import {
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  IOPinConfig,
} from '../../types';
import { BOARD_OPTIONS, getBoardIo } from '../../config/boardProfiles';
import type { BoardChannel, BoardIoDescription } from '../../boards/boardIo';
import { channelAt, channelsFor, mappingProblem, nextFreeChannel, type IoSection } from '../../boards/boardIoMapping';
import type { SectionProps } from './settingsSectionProps';
import { t } from '../../i18n';

export function IOSection({ config, updateConfig }: SectionProps) {
  const io = config.io || { inputs: [], outputs: [] };
  const inputs = io.inputs || [];
  const outputs = io.outputs || [];
  // IO-003: a catalogue board lists its channels; a row can only sit on one of them
  const board = config.target?.board;
  const boardIo = getBoardIo(board);
  const boardLabel = BOARD_OPTIONS.find((option) => option.value === board)?.label ?? board ?? '';

  const virtualRows = io.virtual || [];

  const updateIO = (updates: { inputs?: IOPinConfig[]; outputs?: IOPinConfig[]; virtual?: IOPinConfig[] }) => {
    updateConfig({ io: { ...io, ...updates } });
  };

  /** A row the board has no channel for stays as an image address no pin drives (IO-003). */
  const makeVirtual = (section: IoSection, index: number) => {
    const rows = section === 'inputs' ? inputs : outputs;
    const row = rows[index];
    if (!row) return;
    const remaining = rows.filter((_, each) => each !== index);
    updateIO({
      ...(section === 'inputs' ? { inputs: remaining } : { outputs: remaining }),
      virtual: [...virtualRows, row],
    });
  };

  const removeVirtual = (index: number) => {
    updateIO({ virtual: virtualRows.filter((_, each) => each !== index) });
  };

  /** The row of a channel of the board: its name is the channel id, its address the channel's. */
  const rowOf = (channel: BoardChannel): IOPinConfig => ({
    name: channel.id,
    address: channel.address,
    type: channel.kind === 'analog' ? 'INT' : 'BOOL',
    description: channel.pin,
  });

  const addInput = () => {
    const free = boardIo ? nextFreeChannel(boardIo, 'inputs', 'digital', inputs) : undefined;
    if (boardIo && !free) return;
    const nextIndex = inputs.length;
    const newInput: IOPinConfig = free ? rowOf(free) : {
      name: `Input${nextIndex}`,
      address: `%I0.${nextIndex}`,
      type: 'BOOL',
    };
    updateIO({ inputs: [...inputs, newInput] });
  };

  const addAnalogInput = () => {
    const free = boardIo ? nextFreeChannel(boardIo, 'inputs', 'analog', inputs) : undefined;
    if (boardIo && !free) return;
    // Find next available word offset (heuristic: count existing analog inputs * 2)
    const analogInputs = inputs.filter(i => i.address.includes('%IW'));
    const nextOffset = 4 + (analogInputs.length * 2); // Start at %IW4
    const nextChannel = analogInputs.length;

    const newInput: IOPinConfig = free ? rowOf(free) : {
      name: `AnalogIn${nextChannel}`,
      address: `%IW${nextOffset}`,
      type: 'INT',
      channel: nextChannel,
    };
    updateIO({ inputs: [...inputs, newInput] });
  };

  const addOutput = () => {
    const free = boardIo ? nextFreeChannel(boardIo, 'outputs', 'digital', outputs) : undefined;
    if (boardIo && !free) return;
    const nextIndex = outputs.length;
    const newOutput: IOPinConfig = free ? rowOf(free) : {
      name: `Output${nextIndex}`,
      address: `%Q0.${nextIndex}`,
      type: 'BOOL',
    };
    updateIO({ outputs: [...outputs, newOutput] });
  };

  const addAnalogOutput = () => {
    // A board that lists no analog output has none to map: the button is disabled for it
    if (boardIo && !nextFreeChannel(boardIo, 'outputs', 'analog', outputs)) return;
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

  const hasFree = (section: IoSection, kind: 'digital' | 'analog'): boolean =>
    !boardIo || nextFreeChannel(boardIo, section, kind, section === 'inputs' ? inputs : outputs) !== undefined;

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
      {boardIo && <BoardChannels io={boardIo} boardLabel={boardLabel} />}

      {/* INPUTS */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--color-accent-green)]">
            Inputs (%I)
          </label>
          <div className="flex gap-2">
            <button
              onClick={addInput}
              disabled={!hasFree('inputs', 'digital')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:opacity-40"
              title={hasFree('inputs', 'digital') ? 'Add Digital Input (BOOL)' : `${boardLabel} has no more digital inputs`}
            >
              <Plus size={12} />
              Digital
            </button>
            <button
              onClick={addAnalogInput}
              disabled={!hasFree('inputs', 'analog')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:opacity-40"
              title={hasFree('inputs', 'analog') ? 'Add Analog Input (INT)' : `${boardLabel} has no more analog inputs`}
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
            onMakeVirtual={(index) => makeVirtual('inputs', index)}
            addressPrefix="%I"
            section="inputs"
            boardIo={boardIo}
            boardLabel={boardLabel}
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
              disabled={!hasFree('outputs', 'digital')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:opacity-40"
              title={hasFree('outputs', 'digital') ? 'Add Digital Output (BOOL)' : `${boardLabel} has no more digital outputs`}
            >
              <Plus size={12} />
              Digital
            </button>
            <button
              onClick={addAnalogOutput}
              disabled={!hasFree('outputs', 'analog')}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)] disabled:opacity-40"
              title={hasFree('outputs', 'analog') ? 'Add Analog Output (INT)' : `${boardLabel} has no analog outputs`}
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
            onMakeVirtual={(index) => makeVirtual('outputs', index)}
            addressPrefix="%Q"
            section="outputs"
            boardIo={boardIo}
            boardLabel={boardLabel}
          />
        )}
      </div>

      {/* VIRTUAL */}
      {virtualRows.length > 0 && (
        <div>
          <label className="text-sm font-medium text-[var(--color-surface-200)]">
            Virtual (no pin)
          </label>
          <p className="text-xs text-[var(--color-surface-400)] mb-2">
            Image addresses no pin of the board drives, read in the debugger or by a test.
          </p>
          <ul className="bg-[var(--color-surface-700)] rounded border border-[var(--color-surface-600)]">
            {virtualRows.map((row, index) => (
              <li key={`${row.address}-${index}`} className="flex items-center justify-between px-3 py-2 text-xs border-t first:border-t-0 border-[var(--color-surface-600)]">
                <span className="font-mono">
                  <span className="text-[var(--color-accent-blue)]">{row.address}</span> {row.name}
                  {row.description ? ` - ${row.description}` : ''}
                </span>
                <button
                  onClick={() => removeVirtual(index)}
                  className="p-1 rounded hover:bg-[var(--color-surface-500)] text-[var(--color-accent-red)]"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The channels the selected board has, with their pins: what a row of the tables below can be mapped to. */
function BoardChannels({ io, boardLabel }: { io: BoardIoDescription; boardLabel: string }) {
  return (
    <div className="rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-700)] px-3 py-2 text-xs">
      <div className="text-[var(--color-surface-200)] font-medium">
        {boardLabel}: {channelsFor(io, 'inputs').length} input and {channelsFor(io, 'outputs').length} output channels
      </div>
      <p className="mt-1 text-[var(--color-surface-400)]">
        A row can only sit on a channel the board has; a variable located anywhere else fails the build.
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2" aria-label={`Channels of ${boardLabel}`}>
        {io.channels.map((channel) => (
          <li key={channel.id} className="font-mono text-[var(--color-surface-300)]" title={channel.electrical}>
            <span className="text-[var(--color-accent-blue)]">{channel.address}</span> {channel.id} - {channel.pin}
            {channel.location ? ` (${channel.location})` : ''}
          </li>
        ))}
      </ul>
      {io.unmapped.length > 0 && (
        <p className="mt-2 text-[var(--color-surface-400)]">
          Not mapped: {io.unmapped.map((item) => item.terminal).join(', ')}
        </p>
      )}
    </div>
  );
}

// I/O Table sub-component
interface IOTableProps {
  items: IOPinConfig[];
  onUpdate: (index: number, updates: Partial<IOPinConfig>) => void;
  onRemove: (index: number) => void;
  onMakeVirtual: (index: number) => void;
  addressPrefix: string;
  section: IoSection;
  boardIo: BoardIoDescription | undefined;
  boardLabel: string;
}

function IOTable({ items, onUpdate, onRemove, onMakeVirtual, section, boardIo, boardLabel }: IOTableProps) {
  const boardChannels = boardIo ? channelsFor(boardIo, section) : [];
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
        <div key={index} className="border-t border-[var(--color-surface-600)]">
        <div
          className="grid grid-cols-12 gap-2 px-3 py-2 items-center"
        >
          <div className="col-span-3">
            <input
              aria-label={t('a11y.io.name', { row: index + 1 })}
              type="text"
              value={item.name}
              onChange={(e) => onUpdate(index, { name: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            {boardIo ? (
              <select
                value={channelAt(boardIo, section, item.address)?.address ?? item.address}
                aria-label={`Channel of ${item.name}`}
                onChange={(e) => {
                  const channel = channelAt(boardIo, section, e.target.value);
                  onUpdate(index, channel
                    ? { address: channel.address, type: channel.kind === 'analog' ? 'INT' : 'BOOL', pin: undefined }
                    : { address: e.target.value });
                }}
                className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-accent-blue)] font-mono focus:outline-none"
              >
                {channelAt(boardIo, section, item.address) === undefined && (
                  <option value={item.address}>{item.address} (not on this board)</option>
                )}
                {boardChannels.map((channel) => (
                  <option key={channel.id} value={channel.address}>{channel.address} {channel.id}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={t('a11y.io.address', { row: index + 1 })}
                type="text"
                value={item.address}
                onChange={(e) => onUpdate(index, { address: e.target.value })}
                placeholder="%I0.0"
                className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-accent-blue)] font-mono focus:outline-none"
              />
            )}
          </div>
          <div className="col-span-1">
            <input
              aria-label={t('a11y.io.channel', { row: index + 1 })}
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
            {boardIo ? (
              <span className="block truncate text-xs text-[var(--color-surface-300)]" title={channelAt(boardIo, section, item.address)?.electrical}>
                {channelAt(boardIo, section, item.address)?.pin ?? '-'}
              </span>
            ) : (
              <input
                aria-label={t('a11y.io.pin', { row: index + 1 })}
                type="number"
                value={item.pin ?? ''}
                onChange={(e) => onUpdate(index, { pin: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="IO"
                min={0}
                max={100}
                className="w-full px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded text-[var(--color-surface-100)] focus:outline-none placeholder:text-[var(--color-surface-500)]"
              />
            )}
          </div>
          <div className="col-span-2">
            <select
              aria-label={t('a11y.io.type', { row: index + 1 })}
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
              aria-label={t('a11y.io.description', { row: index + 1 })}
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
        {boardIo && mappingProblem(boardIo, boardLabel, section, item) !== undefined && (
          <div className="px-3 pb-2 text-xs space-y-1">
            <p role="alert" className="text-[var(--color-accent-red)]">
              {mappingProblem(boardIo, boardLabel, section, item)}
            </p>
            <button
              onClick={() => onMakeVirtual(index)}
              className="px-2 py-0.5 rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
              title="Keep this address as an image word that no pin of the board drives"
            >
              Keep as virtual (no pin)
            </button>
          </div>
        )}
        </div>
      ))}
    </div>
  );
}
