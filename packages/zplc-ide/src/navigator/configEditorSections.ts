/** The form each configuration editor hosts, and its icon (UX-013). The forms are the sections the project settings page held. */
import type { ComponentType } from 'react';
import { Cable, Cpu, Radio, Wifi, Zap } from 'lucide-react';
import { CommunicationSection } from '../components/settings/CommunicationSection';
import { IOSection } from '../components/settings/IOSection';
import { NetworkSection } from '../components/settings/NetworkSection';
import type { SectionProps } from '../components/settings/settingsSectionProps';
import { TargetSection } from '../components/settings/TargetSection';
import { TasksSection } from '../components/settings/TasksSection';
import type { ConfigEditorKind } from './configEditors';

export const CONFIG_EDITOR_SECTIONS: Record<ConfigEditorKind, ComponentType<SectionProps>> = {
  tasks: TasksSection,
  io: IOSection,
  network: NetworkSection,
  communication: CommunicationSection,
  target: TargetSection,
};

export const CONFIG_EDITOR_ICONS: Record<ConfigEditorKind, ComponentType<{ size?: number; className?: string }>> = {
  tasks: Zap, io: Cable, network: Wifi, communication: Radio, target: Cpu,
};
