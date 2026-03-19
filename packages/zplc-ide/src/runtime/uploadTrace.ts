export interface UploadTraceEvent {
  kind: 'stage' | 'command' | 'response';
  message: string;
}

export type UploadTraceCallback = (event: UploadTraceEvent) => void;

const SENSITIVE_CONFIG_KEYS = [
  'wifi_pass',
  'mqtt_password',
  'azure_sas_key',
] as const;

function maskQuotedValue(command: string, key: string): string {
  const pattern = new RegExp(`^(zplc\\s+config\\s+set\\s+${key}\\s+)".*"$`);
  if (pattern.test(command)) {
    return command.replace(pattern, `$1"***"`);
  }

  const plainPattern = new RegExp(`^(zplc\\s+config\\s+set\\s+${key}\\s+)\\S+$`);
  if (plainPattern.test(command)) {
    return command.replace(plainPattern, '$1***');
  }

  return command;
}

export function sanitizeUploadTraceCommand(command: string): string {
  return SENSITIVE_CONFIG_KEYS.reduce((sanitized, key) => maskQuotedValue(sanitized, key), command);
}

export function formatChunkTrace(commandPrefix: string, chunkIndex: number, totalChunks: number, chunkSize: number): string {
  return `${commandPrefix} <${chunkSize} bytes hex> (${chunkIndex}/${totalChunks})`;
}
