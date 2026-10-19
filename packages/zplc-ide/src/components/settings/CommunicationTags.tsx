/** The tags the project publishes and subscribes to. */

import {
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  CommunicationTagConfig,
  CommunicationTagType,
} from '../../types';
import { Button, Checkbox, IconButton, NumberField, Select, TextField } from '../../ui';
import { useT } from '../../i18n';

export function CommunicationTags({ tags, addTag, updateTag, removeTag }: { tags: CommunicationTagConfig[]; addTag: () => void; updateTag: (index: number, updates: Partial<CommunicationTagConfig>) => void; removeTag: (index: number) => void }) {
  const { t } = useT();
  return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[var(--color-surface-200)]">{t('commtags.communicationTags')}</h3>
            <Button variant="secondary" size="sm" onClick={addTag}>
              <Plus size={12} />
              {t('commtags.addTag')}
            </Button>
          </div>

          {tags.length === 0 ? (
            <p className="text-xs text-[var(--color-surface-400)] text-center py-3 bg-[var(--color-surface-700)] rounded">
              {t('commtags.noCommunicationTagsConfigured')}
            </p>
          ) : (
            <div className="bg-[var(--color-surface-700)] rounded border border-[var(--color-surface-600)] overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--color-surface-600)] text-xs text-[var(--color-surface-300)] font-medium">
                <div className="col-span-2">{t('dialog.name')}</div>
                <div className="col-span-2">{t('commtags.symbol')}</div>
                <div className="col-span-1">{t('io.type')}</div>
                <div className="col-span-2">{t('commtags.bindings')}</div>
                <div className="col-span-2">{t('modbus.modbus')}</div>
                <div className="col-span-2">{t('io.description')}</div>
                <div className="col-span-1"></div>
              </div>
              {tags.map((tag, index) => (
                <div key={`${tag.symbol}-${index}`} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-[var(--color-surface-600)] items-center">
                  <TextField aria-label={t('dialog.name')} value={tag.name} onChange={(e) => updateTag(index, { name: e.target.value })} className="col-span-2" />
                  <TextField aria-label={t('commtags.symbol')} value={tag.symbol} onChange={(e) => updateTag(index, { symbol: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} className="col-span-2 font-mono" />
                  <Select aria-label={t('io.type')} value={tag.type} onChange={(e) => updateTag(index, { type: e.target.value as CommunicationTagType })} className="col-span-1">
                    <option value="BOOL">{t('io.bool')}</option>
                    <option value="INT">{t('io.int')}</option>
                    <option value="UINT">{t('commtags.uint')}</option>
                    <option value="REAL">{t('io.real')}</option>
                  </Select>
                  <div className="col-span-2 flex gap-2 text-[11px] text-[var(--color-surface-200)]">
                    <Checkbox checked={tag.publish || tag.mode === 'publish'} onChange={(e) => updateTag(index, {
                          publish: e.target.checked,
                          mode: e.target.checked ? 'publish' : undefined,
                        })} label={t('commtags.pub')} />
                    <Checkbox checked={tag.subscribe || tag.mode === 'subscribe'} onChange={(e) => updateTag(index, {
                          subscribe: e.target.checked,
                          mode: e.target.checked ? 'subscribe' : tag.mode === 'subscribe' ? undefined : tag.mode,
                        })} label={t('commtags.sub')} />
                  </div>
                  <NumberField aria-label={t('commtags.modbusAddress')} min={1} max={65535} value={tag.modbusAddress ?? ''} onChange={(e) => updateTag(index, {
                      modbusAddress: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      modbusArea: e.target.value ? (tag.modbusArea ?? (tag.type === 'BOOL' ? 'coil' : 'holding-register')) : tag.modbusArea,
                      mode: e.target.value ? 'modbus' : tag.mode === 'modbus' ? undefined : tag.mode,
                    })} className="col-span-2" />
                  <Select aria-label={t('commtags.modbusArea')} value={tag.modbusArea ?? 'holding-register'} onChange={(e) => updateTag(index, { modbusArea: e.target.value as typeof tag.modbusArea })} className="col-span-2">
                    <option value="coil">{t('commtags.coil')}</option>
                    <option value="discrete-input">{t('commtags.discreteInput')}</option>
                    <option value="input-register">{t('commtags.inputRegister')}</option>
                    <option value="holding-register">{t('commtags.holdingRegister')}</option>
                  </Select>
                  <TextField aria-label={t('io.description')} value={tag.description || ''} onChange={(e) => updateTag(index, { description: e.target.value || undefined })} className="col-span-1" />
                  <IconButton label={t('commtags.removeTag', { value: tag.name || index + 1 })} variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => removeTag(index)} className="col-span-1 text-[var(--color-accent-red)]" />
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
