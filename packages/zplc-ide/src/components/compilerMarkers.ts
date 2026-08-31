import type { CompilerMessage } from '../types';

export interface CompilerMarker { message: string; type: CompilerMessage['type']; line: number; column: number; endColumn: number; }

export function compilerMarkersForFile(messages: CompilerMessage[], file: string, lineCount: number, lineMaxColumn: (line: number) => number): CompilerMarker[] {
  if (!file || lineCount < 1) return [];
  return messages.flatMap((message) => {
    if (message.file !== file || !message.line || message.line < 1) return [];
    const line = Math.min(message.line, lineCount);
    const column = Math.min(Math.max(1, message.column ?? 1), lineMaxColumn(line));
    const maxColumn = lineMaxColumn(line);
    return [{ message: message.message, type: message.type, line, column, endColumn: Math.min(column + 1, maxColumn) }];
  });
}
