/** A stateful host for one section of the project settings, so a render test sees the change it made (VF-007). */
import { useState, type ComponentType } from 'react';
import { DEFAULT_ZPLC_CONFIG, type ZPLCProjectConfig } from '../types';
import type { SectionProps } from '../components/settings/settingsSectionProps';

export type ConfigListener = (config: ZPLCProjectConfig) => void;

export function SectionHost({ Section, initial, onConfig }: { Section: ComponentType<SectionProps>; initial?: Partial<ZPLCProjectConfig>; onConfig?: ConfigListener }) {
  const [config, setConfig] = useState<ZPLCProjectConfig>({ ...DEFAULT_ZPLC_CONFIG, tasks: [], ...initial } as ZPLCProjectConfig);
  return <Section config={config} updateConfig={(updates) => { const next = { ...config, ...updates }; setConfig(next); onConfig?.(next); }} />;
}
