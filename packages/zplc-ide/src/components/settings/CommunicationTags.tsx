/** The tags the project publishes and subscribes to. */

import {
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  CommunicationTagConfig,
  CommunicationTagType,
} from '../../types';

export function CommunicationTags({ tags, addTag, updateTag, removeTag }: { tags: CommunicationTagConfig[]; addTag: () => void; updateTag: (index: number, updates: Partial<CommunicationTagConfig>) => void; removeTag: (index: number) => void }) {
  return (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-[var(--color-surface-200)]">Communication Tags</label>
            <button
              onClick={addTag}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--color-surface-600)] hover:bg-[var(--color-surface-500)] text-[var(--color-surface-200)]"
            >
              <Plus size={12} />
              Add Tag
            </button>
          </div>

          {tags.length === 0 ? (
            <p className="text-xs text-[var(--color-surface-400)] text-center py-3 bg-[var(--color-surface-700)] rounded">
              No communication tags configured.
            </p>
          ) : (
            <div className="bg-[var(--color-surface-700)] rounded border border-[var(--color-surface-600)] overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--color-surface-600)] text-xs text-[var(--color-surface-300)] font-medium">
                <div className="col-span-2">Name</div>
                <div className="col-span-2">Symbol</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-2">Bindings</div>
                <div className="col-span-2">Modbus</div>
                <div className="col-span-2">Description</div>
                <div className="col-span-1"></div>
              </div>
              {tags.map((tag, index) => (
                <div key={`${tag.symbol}-${index}`} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-[var(--color-surface-600)] items-center">
                  <input
                    type="text"
                    value={tag.name}
                    onChange={(e) => updateTag(index, { name: e.target.value })}
                    className="col-span-2 px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded"
                  />
                  <input
                    type="text"
                    value={tag.symbol}
                    onChange={(e) => updateTag(index, { symbol: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
                    className="col-span-2 px-2 py-1 text-xs font-mono bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded"
                  />
                  <select
                    value={tag.type}
                    onChange={(e) => updateTag(index, { type: e.target.value as CommunicationTagType })}
                    className="col-span-1 px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded"
                  >
                    <option value="BOOL">BOOL</option>
                    <option value="INT">INT</option>
                    <option value="UINT">UINT</option>
                    <option value="REAL">REAL</option>
                  </select>
                  <div className="col-span-2 flex gap-2 text-[11px] text-[var(--color-surface-200)]">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={tag.publish || tag.mode === 'publish'}
                        onChange={(e) => updateTag(index, {
                          publish: e.target.checked,
                          mode: e.target.checked ? 'publish' : undefined,
                        })}
                      />
                      pub
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={tag.subscribe || tag.mode === 'subscribe'}
                        onChange={(e) => updateTag(index, {
                          subscribe: e.target.checked,
                          mode: e.target.checked ? 'subscribe' : tag.mode === 'subscribe' ? undefined : tag.mode,
                        })}
                      />
                      sub
                    </label>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={tag.modbusAddress ?? ''}
                    onChange={(e) => updateTag(index, {
                      modbusAddress: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      modbusArea: e.target.value ? (tag.modbusArea ?? (tag.type === 'BOOL' ? 'coil' : 'holding-register')) : tag.modbusArea,
                      mode: e.target.value ? 'modbus' : tag.mode === 'modbus' ? undefined : tag.mode,
                    })}
                    className="col-span-2 px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded disabled:opacity-50"
                  />
                  <select
                    value={tag.modbusArea ?? 'holding-register'}
                    onChange={(e) => updateTag(index, { modbusArea: e.target.value as typeof tag.modbusArea })}
                    className="col-span-2 px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded"
                  >
                    <option value="coil">Coil</option>
                    <option value="discrete-input">Discrete Input</option>
                    <option value="input-register">Input Register</option>
                    <option value="holding-register">Holding Register</option>
                  </select>
                  <input
                    type="text"
                    value={tag.description || ''}
                    onChange={(e) => updateTag(index, { description: e.target.value || undefined })}
                    className="col-span-1 px-2 py-1 text-xs bg-[var(--color-surface-600)] border border-[var(--color-surface-500)] rounded"
                  />
                  <button
                    onClick={() => removeTag(index)}
                    className="col-span-1 p-1 rounded hover:bg-[var(--color-surface-500)] text-[var(--color-accent-red)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
