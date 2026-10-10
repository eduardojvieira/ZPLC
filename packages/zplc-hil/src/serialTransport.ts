import type { ListedPort } from './ports';
import type { ShellTransport } from './shellLink';

const PROMPT = 'zplc:~$';

/** The serial ports that are plugged in. Asking is not opening. */
export async function listSerialPorts(): Promise<ListedPort[]> {
  const { SerialPort } = await import('serialport');
  return (await SerialPort.list()).map((port) => ({
    path: port.path, vendorId: port.vendorId, productId: port.productId, serialNumber: port.serialNumber, manufacturer: port.manufacturer,
  }));
}

/**
 * The firmware shell on a serial port. pyserial's rule applies here too: DTR and RTS are held low, because on an ESP32
 * their toggling at open is the reset sequence, and the handle is kept open for the whole run.
 */
export class SerialShellTransport implements ShellTransport {
  private buffer = '';
  private readonly listeners = new Set<(line: string) => void>();
  private pendingLine = '';
  private readonly port: { write(data: string, callback: (error?: Error | null) => void): void; close(callback: (error?: Error | null) => void): void; isOpen: boolean };

  private constructor(port: SerialShellTransport['port']) {
    this.port = port;
  }

  static async open(path: string, baudRate = 115200): Promise<SerialShellTransport> {
    if (process.env.ZPLC_HIL_FORBID_SERIAL) throw new Error('a serial port may not be opened here (ZPLC_HIL_FORBID_SERIAL is set: this is a test run)');
    const { SerialPort } = await import('serialport');
    const port = new SerialPort({ path, baudRate, autoOpen: false, dsrdtr: false, rtscts: false });
    await new Promise<void>((resolve, reject) => { port.open((error) => (error ? reject(error) : resolve())); });
    await new Promise<void>((resolve) => { port.set({ dtr: false, rts: false }, () => resolve()); });
    const transport = new SerialShellTransport(port);
    port.on('data', (chunk: Buffer) => transport.take(chunk.toString('utf8')));
    await new Promise((resolve) => setTimeout(resolve, 1000)); // the board resets when the port opens
    return transport;
  }

  private take(text: string): void {
    this.buffer += text;
    this.pendingLine += text;
    const lines = this.pendingLine.split(/\r?\n/);
    this.pendingLine = lines.pop() ?? '';
    for (const line of lines) for (const listener of this.listeners) listener(line);
  }

  send(line: string, options: { waitFor?: string; timeoutMs?: number } = {}): Promise<string> {
    const waitFor = options.waitFor ?? PROMPT;
    this.buffer = '';
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (this.buffer.includes(waitFor)) { clearInterval(timer); resolve(this.buffer); }
        else if (Date.now() - started > (options.timeoutMs ?? 5000)) { clearInterval(timer); reject(new Error(`no ${JSON.stringify(waitFor)} after ${line}`)); }
      }, 10);
      this.port.write(`${line}\r\n`, (error) => { if (error) { clearInterval(timer); reject(error); } });
    });
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  close(): Promise<void> {
    return new Promise((resolve) => { if (this.port.isOpen) this.port.close(() => resolve()); else resolve(); });
  }
}
