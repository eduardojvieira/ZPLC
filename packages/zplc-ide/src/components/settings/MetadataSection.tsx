/** Project metadata: name, version, description and author. */

import {
  User,
} from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';
import type { SectionProps } from './settingsSectionProps';

export function MetadataSection({ config, updateConfig }: SectionProps) {
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
