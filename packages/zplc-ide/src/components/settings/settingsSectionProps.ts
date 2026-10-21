/** What every section of the project settings receives: the configuration and the way to change a part of it. */

import type { ZPLCProjectConfig } from '../../types';

export interface SectionProps {
  config: ZPLCProjectConfig;
  updateConfig: (updates: Partial<ZPLCProjectConfig>) => void;
}
