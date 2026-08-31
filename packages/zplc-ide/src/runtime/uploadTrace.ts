export interface UploadTraceEvent {
  kind: 'stage' | 'command' | 'response';
  message: string;
}

export type UploadTraceCallback = (event: UploadTraceEvent) => void;

const SENSITIVE_CONFIG_KEYS = [
  'wifi_pass',
  'mqtt_password',
  'azure_sas_key',
  'mqtt_client_key_path',
  'aws_claim_key_path',
] as const;

const SENSITIVE_CONFIG_COMMAND_PATTERN = new RegExp(
  `(\\bzplc[\\t ]+config[\\t ]+set[\\t ]+(?:${SENSITIVE_CONFIG_KEYS.join('|')})[\\t ]+)("(?:\\\\[^\\r\\n]|[^"\\\\\\r\\n])*"?|[^\\s\\r\\n]*)`,
  'g',
);
const CERTIFICATE_CHUNK_PATTERN = /(\bzplc[\t ]+cert[\t ]+chunk[\t ]+)[^\s\r\n]*/g;

export function sanitizeUploadTraceText(text: string): string {
  return text
    .replace(SENSITIVE_CONFIG_COMMAND_PATTERN, (_match, prefix: string, value: string) => (
      `${prefix}${value.startsWith('"') ? '"***"' : '***'}`
    ))
    .replace(CERTIFICATE_CHUNK_PATTERN, '$1<payload redacted>');
}

export function sanitizeUploadTraceCommand(command: string): string {
  return sanitizeUploadTraceText(command);
}

export function formatChunkTrace(commandPrefix: string, chunkIndex: number, totalChunks: number, chunkSize: number): string {
  return `${commandPrefix} <${chunkSize} bytes hex> (${chunkIndex}/${totalChunks})`;
}
