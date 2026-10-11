/** The hardware target: board, CPU and clock, with the toolchain card of the board. */

import { useState } from 'react';
import {
  Clock,
} from 'lucide-react';
import type {
  TargetConfig,
} from '../../types';
import {
  BOARD_OPTIONS,
  getBoardEvidenceSummary,
  normalizeNetworkConfigForBoard,
} from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';
import { FirmwareImageCard } from './FirmwareImageCard';
import { ToolchainCard } from './ToolchainCard';

export function TargetSection({ config, updateConfig }: SectionProps) {
  // Target is optional in config, so we use a partial type internally
  const target: Partial<TargetConfig> = config.target || {};
  const [customBoard, setCustomBoard] = useState(
    !BOARD_OPTIONS.find(opt => opt.value === target.board) && target.board ? true : false
  );
  const evidence = customBoard ? undefined : getBoardEvidenceSummary(target.board);

  const updateTarget = (updates: Partial<TargetConfig>) => {
    const newTarget = { ...target, ...updates };
    // Only set target if at least board is defined
    if (newTarget.board) {
      const nextBoard = typeof updates.board === 'string' ? updates.board : newTarget.board;
      updateConfig({
        target: newTarget as TargetConfig,
        network: normalizeNetworkConfigForBoard(config.network, nextBoard),
      });
    } else {
      updateConfig({ target: undefined, network: undefined });
    }
  };

  const handleBoardChange = (value: string) => {
    if (value === 'custom') {
      setCustomBoard(true);
      updateConfig({
        target: undefined,
        network: undefined,
      });
    } else {
      setCustomBoard(false);
      const nextTarget = {
        ...target,
        board: value,
      } as TargetConfig;

      updateConfig({
        target: nextTarget,
        network: normalizeNetworkConfigForBoard(config.network, value),
      });
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

      {evidence ? (
        <div className="border-y border-[var(--color-surface-600)] py-3 text-xs leading-5 text-[var(--color-surface-300)]" aria-label="Board evidence tier">
          <p><span className="font-medium text-[var(--color-surface-100)]">Evidence tier:</span> {evidence.validationLevel}</p>
          <p><span className="font-medium text-[var(--color-surface-100)]">{evidence.evidenceCount} HIL evidence records</span></p>
          <p className="mt-1 text-[var(--color-surface-400)]">The firmware image for this board is listed below with this evidence level. Studio never flashes a board: you follow the steps yourself.</p>
        </div>
      ) : target.board ? (
        <p className="border-y border-[var(--color-surface-600)] py-3 text-xs leading-5 text-[var(--color-surface-400)]">No catalogued evidence for this custom target.</p>
      ) : null}

      <FirmwareImageCard ideId={customBoard ? undefined : target.board} />

      <ToolchainCard ideId={customBoard ? undefined : target.board} />

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
