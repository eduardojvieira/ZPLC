import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';

export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceInfo {
  port: string;
  manufacturer?: string;
  serialNumber?: string;
}

export interface ConnectionOptions {
  baudRate?: number;
  autoOpen?: boolean;
}

export interface DebugFrame {
  type: 'opcode' | 'fb' | 'task' | 'error' | 'cycle' | 'ack' | 'ready' | 'watch';
  timestamp: number;
  raw: string;
  payload: any;
}

export interface IDeviceConnection {
  port: string;
  baudRate: number;
  status: DeviceStatus;
  firmwareVersion?: string;
  capabilities: string[];
}

export class Device extends EventEmitter implements IDeviceConnection {
  port: string;
  baudRate: number;
  status: DeviceStatus = 'disconnected';
  firmwareVersion?: string;
  capabilities: string[] = [];
  
  private serial?: SerialPort;
  private parser?: ReadlineParser;
  private frameHandler?: (frame: DebugFrame) => void;

  constructor(port: string, baudRate: number = 115200) {
    super();
    this.port = port;
    this.baudRate = baudRate;
  }

  async connect(): Promise<void> {
    this.status = 'connecting';
    this.emit('status', this.status);

    return new Promise((resolve, reject) => {
      this.serial = new SerialPort({
        path: this.port,
        baudRate: this.baudRate,
        autoOpen: false,
      });

      this.parser = this.serial.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      this.serial.on('open', () => {
        this.status = 'connected';
        this.emit('status', this.status);
        resolve();
      });

      this.serial.on('error', (err) => {
        this.status = 'error';
        this.emit('status', this.status);
        this.emit('error', err);
        reject(err);
      });

      this.parser.on('data', (line: string) => {
        this.handleLine(line);
      });

      this.serial.open((err) => {
        if (err) {
          this.status = 'error';
          this.emit('status', this.status);
          reject(err);
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.serial && this.serial.isOpen) {
      return new Promise((resolve, reject) => {
        this.serial!.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.status = 'disconnected';
            this.emit('status', this.status);
            resolve();
          }
        });
      });
    }
  }

  send(cmd: string): void {
    if (this.serial && this.serial.isOpen) {
      this.serial.write(cmd + '\r\n');
    } else {
      throw new Error('Device not connected');
    }
  }

  onFrame(handler: (frame: DebugFrame) => void): void {
    this.frameHandler = handler;
  }

  waitFor(pattern: RegExp, timeout: number): Promise<DebugFrame> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('frame', listener);
        reject(new Error(`Timeout waiting for pattern ${pattern}`));
      }, timeout);

      const listener = (frame: DebugFrame) => {
        if (pattern.test(frame.raw)) {
          clearTimeout(timer);
          this.off('frame', listener);
          resolve(frame);
        }
      };

      this.on('frame', listener);
    });
  }

  private handleLine(line: string): void {
    const timestamp = Date.now();
    let frame: DebugFrame | null = null;

    try {
      // Trim whitespace for robustness
      const cleanLine = line.trim();
      if (cleanLine.startsWith('{')) {
        const payload = JSON.parse(cleanLine);
        frame = {
          type: payload.t || 'unknown',
          timestamp,
          raw: cleanLine,
          payload
        };
        
        if (frame.type === 'ready') {
            this.firmwareVersion = payload.fw;
            this.capabilities = payload.caps || [];
            this.emit('ready', payload);
        }
      }
    } catch (e) {
      // Ignore parse errors (e.g. shell prompts)
    }

    if (frame) {
      this.emit('frame', frame);
      if (this.frameHandler) {
        this.frameHandler(frame);
      }
    } else {
        // Emit raw lines too for debugging
        this.emit('line', line);
    }
  }
}

export async function connect(port: string, options?: ConnectionOptions): Promise<Device> {
  const device = new Device(port, options?.baudRate);
  await device.connect();
  return device;
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const ports = await SerialPort.list();
  return ports.map(p => ({
    port: p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber
  }));
}
