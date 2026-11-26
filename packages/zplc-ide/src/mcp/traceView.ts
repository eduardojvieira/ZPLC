// AIX-U5 RED stub: the agent-sized trace view lands with the GREEN commit.
export const MAX_OUTPUT_BYTES = 512 * 1024;
export const MAX_INTERNAL_TRACE_BYTES = 16 * 1024 * 1024;
export type Replay = Record<string, any>;
export function traceAnswer(..._args: unknown[]): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
} {
  throw new Error('trace_get modes are not implemented');
}
