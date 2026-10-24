/**
 * What of zplc.json an assistant may see and may propose (IDE-030). The sensitive fields of the project (a Wi-Fi password, an
 * MQTT secret, a key path) never reach it, and a proposal may not add or change one. The list is the one of
 * `project/sensitiveConfig.ts`, kept here without its imports so the main process can use it; a test holds the two equal.
 */
export const AI_SENSITIVE_MANIFEST_PATHS = [
  'network.wifi.password',
  'communication.mqtt.password',
  'communication.mqtt.azureSasKey',
  'communication.mqtt.clientKeyPath',
  'communication.mqtt.awsClaimKeyPath',
] as const;

// the key names the project parser also refuses (projectModel.ts): a credential by its name
const CREDENTIAL_KEY = /(?:password|passwd|secret|secretkey|token|apikey|accesskey|privatekey(?:path)?|saskey|credential(?:s)?|bearer|psk)$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function credentialNamed(key: string): boolean {
  return CREDENTIAL_KEY.test(key.replace(/[_-]/g, '').toLowerCase());
}
function filled(value: unknown): boolean {
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

/** A copy of the manifest without any field that holds a credential, whatever its value. */
export function manifestForAssistant(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) return value.map((item, index) => manifestForAssistant(item, `${path}[${index}]`));
  if (!isObject(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (credentialNamed(key) || (AI_SENSITIVE_MANIFEST_PATHS as readonly string[]).includes(childPath)) continue;
    copy[key] = manifestForAssistant(child, childPath);
  }
  return copy;
}

/** The paths of the manifest that hold a value in a sensitive field: a proposal that has one is refused. */
export function manifestSensitivePaths(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => manifestSensitivePaths(item, `${path}[${index}]`));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    const listed = (AI_SENSITIVE_MANIFEST_PATHS as readonly string[]).includes(childPath);
    return (listed || credentialNamed(key)) && filled(child) ? [childPath] : manifestSensitivePaths(child, childPath);
  });
}
