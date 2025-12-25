/**
 * WebSerial Uploader for ZPLC
 * 
 * Implements the serial communication protocol for uploading bytecode
 * to a ZPLC-enabled Zephyr device.
 * 
 * Protocol:
 *   1. Stop any running program: "zplc stop\n"
 *   2. Prepare buffer: "zplc load <size>\n"
 *   3. Send hex chunks: "zplc data <hex>\n" (max 64 bytes per chunk = 128 hex chars)
 *   4. Start execution: "zplc start\n"
 *   
 * Each command returns "OK: ..." on success or "ERROR: ..." on failure.
 */

// Type augmentation for WebSerial API
declare global {
  interface Navigator {
    serial: Serial;
  }
  
  interface Serial {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }
  
  interface SerialPortRequestOptions {
    filters?: SerialPortFilter[];
  }
  
  interface SerialPortFilter {
    usbVendorId?: number;
    usbProductId?: number;
  }
  
  interface SerialPort {
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
  }
  
  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }
  
  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }
}

/** Maximum bytes per data chunk (64 bytes = 128 hex characters) */
const MAX_CHUNK_SIZE = 64;

/** Command timeout in milliseconds */
const COMMAND_TIMEOUT_MS = 3000;

/** Line ending for commands */
const LINE_ENDING = '\r\n';

/**
 * Connection state for the serial port
 */
export interface SerialConnection {
  port: SerialPort;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  isConnected: boolean;
}

/**
 * Upload progress callback
 */
export type ProgressCallback = (
  stage: 'connecting' | 'stopping' | 'loading' | 'sending' | 'starting' | 'complete' | 'error',
  progress: number,
  message: string
) => void;

/**
 * Check if WebSerial is supported in this browser
 */
export function isWebSerialSupported(): boolean {
  return 'serial' in navigator;
}

/**
 * Request user to select a serial port
 * @returns SerialPort or null if cancelled
 */
export async function requestPort(): Promise<SerialPort | null> {
  if (!isWebSerialSupported()) {
    throw new Error('WebSerial is not supported in this browser. Use Chrome or Edge.');
  }

  try {
    // Request port with optional filter for common USB-Serial adapters
    const port = await navigator.serial.requestPort({
      // Most common USB-serial chips
      filters: [
        { usbVendorId: 0x0403 }, // FTDI
        { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
        { usbVendorId: 0x1A86 }, // CH340
        { usbVendorId: 0x0483 }, // STMicroelectronics (ST-Link)
        { usbVendorId: 0x239A }, // Adafruit
        { usbVendorId: 0x2341 }, // Arduino
        { usbVendorId: 0x1366 }, // SEGGER J-Link
        { usbVendorId: 0x303A }, // Espressif
      ]
    });
    return port;
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError') {
      // User cancelled the picker
      return null;
    }
    throw e;
  }
}

/**
 * Connect to a serial port
 * @param port SerialPort to connect to
 * @param baudRate Baud rate (default 115200)
 */
export async function connect(
  port: SerialPort,
  baudRate: number = 115200
): Promise<SerialConnection> {
  await port.open({ baudRate });

  if (!port.readable || !port.writable) {
    throw new Error('Port is not readable/writable');
  }

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();

  return {
    port,
    reader,
    writer,
    isConnected: true,
  };
}

/**
 * Disconnect from a serial port
 */
export async function disconnect(connection: SerialConnection): Promise<void> {
  try {
    connection.reader.releaseLock();
    connection.writer.releaseLock();
    await connection.port.close();
  } catch (e) {
    // Ignore errors during cleanup
  }
  connection.isConnected = false;
}

/**
 * Send a command and wait for response
 * @param connection Serial connection
 * @param command Command to send (without line ending)
 * @returns Response line
 */
async function sendCommand(
  connection: SerialConnection,
  command: string
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Send command
  const data = encoder.encode(command + LINE_ENDING);
  await connection.writer.write(data);
  
  // Read response with timeout
  let response = '';
  const startTime = Date.now();
  
  while (Date.now() - startTime < COMMAND_TIMEOUT_MS) {
    const { value, done } = await Promise.race([
      connection.reader.read(),
      new Promise<{ value: undefined; done: true }>((resolve) =>
        setTimeout(() => resolve({ value: undefined, done: true }), 100)
      ),
    ]);
    
    if (done || !value) {
      continue;
    }
    
    response += decoder.decode(value);
    
    // Check for complete response (ends with newline and contains OK or ERROR)
    const lines = response.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('OK:') || trimmed.startsWith('ERROR:') ||
          trimmed.startsWith('WARN:')) {
        return trimmed;
      }
    }
  }
  
  throw new Error(`Command timeout: ${command}`);
}

/**
 * Convert a Uint8Array to hex string
 */
function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Upload bytecode to the connected device
 * @param connection Serial connection
 * @param bytecode Bytecode to upload (raw bytes, not .zplc file)
 * @param onProgress Progress callback
 */
export async function uploadBytecode(
  connection: SerialConnection,
  bytecode: Uint8Array,
  onProgress?: ProgressCallback
): Promise<void> {
  const notify = (
    stage: Parameters<ProgressCallback>[0],
    progress: number,
    message: string
  ) => {
    onProgress?.(stage, progress, message);
  };

  try {
    // Step 1: Stop any running program
    notify('stopping', 0, 'Stopping current program...');
    const stopResponse = await sendCommand(connection, 'zplc stop');
    if (stopResponse.startsWith('ERROR:')) {
      throw new Error(`Stop failed: ${stopResponse}`);
    }
    
    // Small delay to let the device settle
    await new Promise((r) => setTimeout(r, 100));
    
    // Step 2: Prepare to load
    notify('loading', 10, `Preparing to receive ${bytecode.length} bytes...`);
    const loadResponse = await sendCommand(connection, `zplc load ${bytecode.length}`);
    if (loadResponse.startsWith('ERROR:')) {
      throw new Error(`Load failed: ${loadResponse}`);
    }
    
    // Step 3: Send data in chunks
    const totalChunks = Math.ceil(bytecode.length / MAX_CHUNK_SIZE);
    let offset = 0;
    let chunkNum = 0;
    
    while (offset < bytecode.length) {
      const chunkSize = Math.min(MAX_CHUNK_SIZE, bytecode.length - offset);
      const chunk = bytecode.slice(offset, offset + chunkSize);
      const hexChunk = toHex(chunk);
      
      const progress = 10 + Math.floor((chunkNum / totalChunks) * 80);
      notify('sending', progress, `Sending chunk ${chunkNum + 1}/${totalChunks}...`);
      
      const dataResponse = await sendCommand(connection, `zplc data ${hexChunk}`);
      if (dataResponse.startsWith('ERROR:')) {
        throw new Error(`Data transfer failed at offset ${offset}: ${dataResponse}`);
      }
      
      offset += chunkSize;
      chunkNum++;
    }
    
    // Step 4: Start execution
    notify('starting', 95, 'Starting program...');
    const startResponse = await sendCommand(connection, 'zplc start');
    if (startResponse.startsWith('ERROR:')) {
      throw new Error(`Start failed: ${startResponse}`);
    }
    
    notify('complete', 100, 'Upload complete! Program running.');
  } catch (e) {
    notify('error', 0, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * Get device status
 * @param connection Serial connection
 * @returns Status response
 */
export async function getStatus(connection: SerialConnection): Promise<string> {
  const response = await sendCommand(connection, 'zplc status');
  return response;
}

/**
 * Reset the device
 * @param connection Serial connection
 */
export async function resetDevice(connection: SerialConnection): Promise<void> {
  await sendCommand(connection, 'zplc reset');
}

/**
 * Get device version
 * @param connection Serial connection
 * @returns Version string
 */
export async function getVersion(connection: SerialConnection): Promise<string> {
  const response = await sendCommand(connection, 'zplc version');
  return response;
}
