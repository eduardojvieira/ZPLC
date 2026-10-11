/**
 * @file shellTransport.ts
 * @brief The device link over the lines of the text shell (COM-019): `zplc link <hex>` out, `ZF:<hex>` lines in.
 *
 * The shell of the device frames its own lines, so every line is one whole frame and the transport needs no
 * resynchronisation. The device prints a frame behind a newline, so a frame that lands in the middle of the
 * text that another command is printing is a line of its own: this transport takes those lines out of the text
 * and leaves the rest of it to the reader of the shell.
 */

import type { LinkTransport } from './deviceLink';

/** The console of a serial port, as the transport needs it. */
export interface ShellConsole {
  writeText(text: string): Promise<void>;
  /** Subscribe to the raw text the port delivers; returns the unsubscribe function. */
  onText(handler: (chunk: string) => void): () => void;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const FRAME_LINE = /ZF:((?:[0-9a-fA-F]{2})+)/;
/** A line longer than a frame in hexadecimal cannot be a frame: the buffer is bounded. */
const LINE_LIMIT = 4096;

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index++) out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}

export function bytesToLowerHex(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += byte.toString(16).padStart(2, '0');
  return text;
}

export class ShellLineTransport implements LinkTransport {
  private readonly console: ShellConsole;
  private readonly handlers = new Set<(bytes: Uint8Array) => void>();
  private readonly closers = new Set<(reason: string) => void>();
  private readonly unsubscribe: () => void;
  private pending = '';

  constructor(console: ShellConsole) {
    this.console = console;
    this.unsubscribe = console.onText((chunk) => this.receive(chunk));
  }

  write(bytes: Uint8Array): Promise<void> {
    return this.console.writeText(`zplc link ${bytesToLowerHex(bytes)}\r\n`);
  }

  onData(handler: (bytes: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: (reason: string) => void): () => void {
    this.closers.add(handler);
    return () => this.closers.delete(handler);
  }

  /** The port is closed by whoever owns it; this stops listening. */
  close(): void {
    this.unsubscribe();
    this.pending = '';
  }

  private receive(chunk: string): void {
    this.pending += chunk.replace(ANSI, '').replace(/\r/g, '');
    let newline = this.pending.indexOf('\n');
    while (newline >= 0) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      const match = FRAME_LINE.exec(line);
      if (match) {
        const bytes = hexToBytes(match[1]!);
        for (const handler of this.handlers) handler(bytes);
      }
      newline = this.pending.indexOf('\n');
    }
    if (this.pending.length > LINE_LIMIT) this.pending = this.pending.slice(-LINE_LIMIT);
  }

  /** The lines of a text that are frames of the link, with those lines removed: what the reader of the shell keeps. */
  static withoutFrames(text: string): string {
    return text.replace(/(^|\n)[^\n]*ZF:(?:[0-9a-fA-F]{2})+[^\n]*(?=\n|$)/g, '$1').replace(/\n{2,}/g, '\n');
  }
}
