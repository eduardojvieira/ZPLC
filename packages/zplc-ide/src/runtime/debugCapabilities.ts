import type { SystemInfo } from './serialAdapter';
import type { NativeCapabilityProfile } from './nativeProtocol';

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

export const LEGACY_WASM_FEATURES = {
  pause: {
    status: DEBUG_CAPABILITY_STATUS.UNAVAILABLE,
    reason: 'Browser WASM simulation is disabled until a verifier-enabled artifact is built',
    recommendedAction: 'Use native simulation',
  },
  resume: {
    status: DEBUG_CAPABILITY_STATUS.UNAVAILABLE,
    reason: 'Browser WASM simulation is disabled until a verifier-enabled artifact is built',
    recommendedAction: 'Use native simulation',
  },
  step: {
    status: DEBUG_CAPABILITY_STATUS.UNAVAILABLE,
    reason: 'Browser WASM simulation is disabled until a verifier-enabled artifact is built',
    recommendedAction: 'Use native simulation',
  },
  breakpoints: {
    status: DEBUG_CAPABILITY_STATUS.UNAVAILABLE,
    reason: 'Browser WASM simulation is disabled until a verifier-enabled artifact is built',
    recommendedAction: 'Use native simulation',
  },
} as const satisfies Record<string, DebugFeatureSupport>;

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

export function getLegacyWasmCapabilities(): DebugCapabilities {
  return {
    mode: DEBUG_CAPABILITY_MODE.LEGACY,
    supportsPause: false,
    supportsResume: false,
    supportsStep: false,
    supportsBreakpoints: false,
    features: {
      pause: LEGACY_WASM_FEATURES.pause,
      resume: LEGACY_WASM_FEATURES.resume,
      step: LEGACY_WASM_FEATURES.step,
      breakpoints: LEGACY_WASM_FEATURES.breakpoints,
    },
  };
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

  return {
    mode: DEBUG_CAPABILITY_MODE.SCHEDULER,
    supportsPause: pause.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsResume: resume.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsStep: step.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    supportsBreakpoints: breakpoints.status === DEBUG_CAPABILITY_STATUS.SUPPORTED,
    features: {
      pause,
      resume,
      step,
      breakpoints,
      'simulation-inputs': simulationInputs,
    },
  };
}
