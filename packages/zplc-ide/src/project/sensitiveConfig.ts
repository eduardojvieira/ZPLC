import type { ZPLCProjectConfig } from '../types';

/**
 * The project configuration values that never leave a project: a Wi-Fi password, an MQTT secret, a key path. An export
 * redacts them, and a configuration that holds one is refused when a project is opened (`parseAndMigrateProject`).
 */
export const SENSITIVE_PROJECT_CONFIG_PATHS = [
  'network.wifi.password',
  'communication.mqtt.password',
  'communication.mqtt.azureSasKey',
  'communication.mqtt.clientKeyPath',
  'communication.mqtt.awsClaimKeyPath',
] as const;

type SensitiveProjectConfigPath = (typeof SENSITIVE_PROJECT_CONFIG_PATHS)[number];

export interface RedactedProjectConfigExport {
  config: ZPLCProjectConfig;
  redactedPaths: SensitiveProjectConfigPath[];
}

function getPathValue(config: unknown, path: SensitiveProjectConfigPath): unknown {
  let value: unknown = config;
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object' || !(segment in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function deletePath(config: Record<string, unknown>, path: SensitiveProjectConfigPath): boolean {
  const segments = path.split('.');
  const leaf = segments.pop();
  let parent: Record<string, unknown> = config;

  for (const segment of segments) {
    const next = parent[segment];
    if (next === null || typeof next !== 'object') {
      return false;
    }
    parent = next as Record<string, unknown>;
  }

  if (!leaf || !Object.prototype.hasOwnProperty.call(parent, leaf)) {
    return false;
  }
  delete parent[leaf];
  return true;
}

export function findNonEmptySensitiveProjectConfigPaths(config: unknown): SensitiveProjectConfigPath[] {
  return SENSITIVE_PROJECT_CONFIG_PATHS.filter((path) => {
    const value = getPathValue(config, path);
    return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
  });
}

export function redactProjectConfigForExport(config: ZPLCProjectConfig): RedactedProjectConfigExport {
  const exportedConfig = structuredClone(config);
  const mutableConfig = exportedConfig as unknown as Record<string, unknown>;
  const redactedPaths = SENSITIVE_PROJECT_CONFIG_PATHS.filter((path) => deletePath(mutableConfig, path));

  return { config: exportedConfig, redactedPaths };
}
