import type { SystemInfo } from './serialAdapter';
import type { NativeCapabilityProfile } from './nativeProtocol';
import { wasmCapabilityProfile } from './wasmCapabilities';

export const DEBUG_CAPABILITY_MODE = {
  LEGACY: 'legacy',
  SCHEDULER: 'scheduler',
} as const;

export type DebugCapabilityMode = (typeof DEBUG_CAPABILITY_MODE)[keyof typeof DEBUG_CAPABILITY_MODE];

export const DEBUG_CAPABILITY_STATUS = {
  SUPPORTED: 'supported',
  DEGRADED: 'degraded',
  UNAVAILABLE: 'unavailable',
} as const;

export type DebugCapabilityStatus =
  (typeof DEBUG_CAPABILITY_STATUS)[keyof typeof DEBUG_CAPABILITY_STATUS];

export interface DebugFeatureSupport {
  status: DebugCapabilityStatus;
  reason?: string;
  recommendedAction?: string;
}

export interface DebugCapabilities {
  mode: DebugCapabilityMode;
  supportsPause: boolean;
  supportsResume: boolean;
  supportsStep: boolean;
  supportsBreakpoints: boolean;
  features: Record<string, DebugFeatureSupport>;
}

export function getDebugCapabilities(systemInfo: SystemInfo | null): DebugCapabilities {
  const supported: DebugFeatureSupport = {
    status: DEBUG_CAPABILITY_STATUS.SUPPORTED,
  };

  if (systemInfo?.capabilities.scheduler) {
    return {
      mode: DEBUG_CAPABILITY_MODE.SCHEDULER,
      supportsPause: true,
      supportsResume: true,
      supportsStep: true,
      supportsBreakpoints: true,
      features: {
        pause: supported,
        resume: supported,
        step: supported,
        breakpoints: supported,
      },
    };
  }

  return {
    mode: DEBUG_CAPABILITY_MODE.LEGACY,
    supportsPause: true,
    supportsResume: true,
    supportsStep: true,
    supportsBreakpoints: true,
    features: {
      pause: supported,
      resume: supported,
      step: supported,
      breakpoints: supported,
    },
  };
}

/**
 * What the WebAssembly runtime can do, from the profile its handshake reports (wasmCapabilities.ts): the same source
 * for the controller, for the status bar and for the check of public claims about the browser simulator (DOC-012).
 */
export function getWasmCapabilities(): DebugCapabilities {
  return getDebugCapabilitiesFromProfile(wasmCapabilityProfile('project'));
}

export function getDebugCapabilitiesFromProfile(
  profile: NativeCapabilityProfile | null,
): DebugCapabilities {
  const buildSupport = (featureName: string): DebugFeatureSupport => {
    const matches = profile?.features.filter((entry) => entry.name === featureName) ?? [];
    if (matches.length !== 1) {
      return {
        status: DEBUG_CAPABILITY_STATUS.UNAVAILABLE,
        reason: matches.length === 0
          ? 'Feature not reported by native simulator capability profile'
          : 'Feature reported more than once by native simulator capability profile',
      };
    }
    const feature = matches[0]!;

    return {
      status: feature.status,
      reason: feature.reason,
      recommendedAction: feature.recommended_action,
    };
  };

  const pause = buildSupport('pause');
  const resume = buildSupport('resume');
  const step = buildSupport('step');
  const breakpoints = buildSupport('breakpoints');
  const simulationInputs = buildSupport('simulation-inputs');
  // every other feature the runtime names is carried as it reported it: the controller asks about the ones it knows
  const others: Record<string, DebugFeatureSupport> = {};
  for (const entry of profile?.features ?? []) {
    if (!['pause', 'resume', 'step', 'breakpoints', 'simulation-inputs'].includes(entry.name)) {
      others[entry.name] = buildSupport(entry.name);
    }
  }

  return {
    mode: DEBUG_CAPABILITY_MODE.SCHEDULER,
    supportsPause: pause.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsResume: resume.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsStep: step.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsBreakpoints: breakpoints.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    features: {
      ...others,
      pause,
      resume,
      step,
      breakpoints,
      'simulation-inputs': simulationInputs,
    },
  };
}
