/** The hardware target: board, CPU and clock, with the toolchain card of the board. */

import { useState } from 'react';
import { useT } from '../../i18n';
import { Clock } from 'lucide-react';
import type { TargetConfig } from '../../types';
import { BOARD_OPTIONS, getBoardEvidenceSummary, normalizeNetworkConfigForBoard } from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';
import { FirmwareImageCard } from './FirmwareImageCard';
import { ToolchainCard } from './ToolchainCard';
import { Button, NumberField, Select, TextField } from '../../ui';

export function TargetSection({ config, updateConfig }: SectionProps) {
  const { t } = useT();
  // Target is optional in config, so we use a partial type internally
  const target: Partial<TargetConfig> = config.target || {};
  const [customBoard, setCustomBoard] = useState(!BOARD_OPTIONS.find((opt) => opt.value === target.board) && target.board ? true : false);
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
        {customBoard ? (
          <div className="flex items-end gap-2">
            <TextField
              label={t('settings.target.board')}
              value={target.board || ''}
              onChange={(e) => updateTarget({ board: e.target.value })}
              placeholder={t('settings.target.boardPlaceholder')}
              fieldClassName="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={() => setCustomBoard(false)}>
              {t('settings.target.useList')}
            </Button>
          </div>
        ) : (
          <Select
            label={t('settings.target.board')}
            value={target.board || ''}
            onChange={(e) => handleBoardChange(e.target.value)}
            className="w-full"
          >
            {BOARD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {evidence ? (
        <div
          className="border-y border-[var(--color-surface-600)] py-3 text-xs leading-5 text-[var(--color-surface-300)]"
          aria-label={t('settings.target.tierLabel')}
        >
          <p>
            <span className="font-medium text-[var(--color-surface-100)]">{t('settings.target.tier')}</span> {evidence.validationLevel}
          </p>
          <p>
            <span className="font-medium text-[var(--color-surface-100)]">
              {t('settings.target.records', { count: evidence.evidenceCount })}
            </span>
          </p>
          <p className="mt-1 text-[var(--color-surface-400)]">{t('settings.target.imageNote')}</p>
        </div>
      ) : target.board ? (
        <p className="border-y border-[var(--color-surface-600)] py-3 text-xs leading-5 text-[var(--color-surface-400)]">
          {t('settings.target.noEvidence')}
        </p>
      ) : null}

      <FirmwareImageCard ideId={customBoard ? undefined : target.board} />

      <ToolchainCard ideId={customBoard ? undefined : target.board} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <TextField
            label={t('settings.target.cpu')}
            value={target.cpu || ''}
            onChange={(e) => updateTarget({ cpu: e.target.value || undefined })}
            placeholder={t('settings.target.cpuPlaceholder')}
            className="w-full"
          />
        </div>
        <div>
          <NumberField
            label={
              <>
                <Clock size={10} className="mr-1 inline" aria-hidden="true" />
                {t('settings.target.clock')}
              </>
            }
            value={target.clock_mhz || ''}
            onChange={(e) => updateTarget({ clock_mhz: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder={t('settings.target.clockPlaceholder')}
            min={1}
            max={1000}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
