/** Project metadata: name, version, description and author. */

import {
  User,
} from 'lucide-react';
import { useIDEStore } from '../../store/useIDEStore';
import type { SectionProps } from './settingsSectionProps';
import { TextField, Textarea } from '../../ui';

export function MetadataSection({ config, updateConfig }: SectionProps) {
  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <TextField label="Project Name" value={config.name} onChange={(e) => {
              updateConfig({ name: e.target.value });
              useIDEStore.setState({ projectName: e.target.value });
            }} className="w-full" />
        </div>
        <div>
          <TextField label="Version" value={config.version} onChange={(e) => updateConfig({ version: e.target.value })} placeholder="1.0.0" className="w-full" />
        </div>
      </div>

      <div>
        <TextField label={<><User size={10} className="mr-1 inline" aria-hidden="true" />Author</>} value={config.author || ''} onChange={(e) => updateConfig({ author: e.target.value || undefined })} placeholder="Your name or organization" className="w-full" />
      </div>

      <div>
        <Textarea label="Description" value={config.description || ''} onChange={(e) => updateConfig({ description: e.target.value || undefined })} placeholder="Brief description of the project..." rows={2} className="w-full resize-none" />
      </div>
    </div>
  );
}
