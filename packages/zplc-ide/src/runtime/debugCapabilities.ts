import type { SystemInfo } from './serialAdapter';

export const DEBUG_CAPABILITY_MODE = {
  LEGACY: 'legacy',
  SCHEDULER: 'scheduler',
} as const;

export type DebugCapabilityMode = (typeof DEBUG_CAPABILITY_MODE)[keyof typeof DEBUG_CAPABILITY_MODE];

export interface DebugCapabilities {
  mode: DebugCapabilityMode;
  supportsPause: boolean;
  supportsResume: boolean;
  supportsStep: boolean;
  supportsBreakpoints: boolean;
}

export function getDebugCapabilities(systemInfo: SystemInfo | null): DebugCapabilities {
  if (systemInfo?.capabilities.scheduler) {
    return {
      mode: DEBUG_CAPABILITY_MODE.SCHEDULER,
      supportsPause: true,
      supportsResume: true,
      supportsStep: true,
      supportsBreakpoints: true,
    };
  }

  return {
    mode: DEBUG_CAPABILITY_MODE.LEGACY,
    supportsPause: true,
    supportsResume: true,
    supportsStep: true,
    supportsBreakpoints: true,
  };
}
