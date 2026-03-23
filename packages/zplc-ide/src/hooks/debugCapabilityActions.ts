import type { IDebugAdapter } from '../runtime/debugAdapter';
import {
  DEBUG_CAPABILITY_STATUS,
  getDebugCapabilities,
  getDebugCapabilitiesFromProfile,
  getLegacyWasmCapabilities,
  type DebugCapabilities,
  type DebugFeatureSupport,
} from '../runtime/debugCapabilities';
import type { SystemInfo } from '../runtime/serialAdapter';
import type { NativeCapabilityProfile } from '../runtime/nativeProtocol';

export function hasNativeCapabilityProfile(
  adapter: IDebugAdapter | null,
): adapter is IDebugAdapter & { capabilities: NativeCapabilityProfile | null } {
  return typeof adapter === 'object' && adapter !== null && 'capabilities' in adapter;
}

export function getDebugCapabilitiesForAdapter(
  adapter: IDebugAdapter | null,
  debugMode: 'none' | 'simulation' | 'hardware',
  controllerInfo: SystemInfo | null,
): DebugCapabilities | null {
  if (!adapter) {
    return null;
  }

  if (adapter.type === 'native' && hasNativeCapabilityProfile(adapter)) {
    return getDebugCapabilitiesFromProfile(adapter.capabilities);
  }

  if (adapter.type === 'wasm') {
    return getLegacyWasmCapabilities();
  }

  if (debugMode === 'hardware') {
    return getDebugCapabilities(controllerInfo);
  }

  return getDebugCapabilities(null);
}

export function getDebugFeatureActionability(
  capabilities: DebugCapabilities | null,
  featureName: string,
  actionLabel: string,
): {
  allowed: boolean;
  support: DebugFeatureSupport | null;
  message: string | null;
} {
  if (!capabilities) {
    return {
      allowed: true,
      support: null,
      message: null,
    };
  }

  const support = capabilities.features[featureName];
  if (!support) {
    return {
      allowed: true,
      support: null,
      message: null,
    };
  }

  if (support.status === DEBUG_CAPABILITY_STATUS.UNAVAILABLE) {
    return {
      allowed: false,
      support,
      message: support.reason
        ? `${actionLabel} unavailable: ${support.reason}`
        : `${actionLabel} unavailable in the active runtime`,
    };
  }

  if (support.status === DEBUG_CAPABILITY_STATUS.DEGRADED) {
    const recommendation = support.recommendedAction ? ` ${support.recommendedAction}` : '';
    return {
      allowed: true,
      support,
      message: support.reason
        ? `${actionLabel} is degraded: ${support.reason}.${recommendation}`.trim()
        : `${actionLabel} is degraded in the active runtime.${recommendation}`.trim(),
    };
  }

  return {
    allowed: true,
    support,
    message: null,
  };
}
