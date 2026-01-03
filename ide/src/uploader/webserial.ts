/**
 * WebSerial Uploader for ZPLC
 * 
 * Implements the serial communication protocol for uploading bytecode
 * to a ZPLC-enabled Zephyr device.
 * 
 * Protocol:
 *   1. Stop any running program: "zplc stop\n"
 *   2. Prepare buffer: "zplc load <size>\n"
 *   3. Send hex chunks: "zplc data <hex>\n" (max 32 bytes per chunk = 64 hex chars)
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
    setSignals(signals: SerialOutputSignals): Promise<void>;
    getSignals(): Promise<SerialInputSignals>;
  }

  interface SerialOutputSignals {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
    break?: boolean;
  }

  interface SerialInputSignals {
    dataCarrierDetect: boolean;
    clearToSend: boolean;
    ringIndicator: boolean;
    dataSetReady: boolean;
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

/** Maximum bytes per data chunk (16 bytes = 32 hex characters) - reduced for stability */
const MAX_CHUNK_SIZE = 16;

/** Command timeout in milliseconds - increased for reliability */
const COMMAND_TIMEOUT_MS = 10000;

/**
 * Connection state for the serial port
 */
export interface SerialConnection {
  port: SerialPort;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  isConnected: boolean;
  // Internal: accumulated receive buffer
  _rxBuffer: string;
  // Internal: reader running in background
  _readerTask: Promise<void> | null;
  // Internal: abort controller to stop reader
  _abortController: AbortController;
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
    const port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x0403 }, // FTDI
        { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
        { usbVendorId: 0x1A86 }, // CH340
        { usbVendorId: 0x0483 }, // STMicroelectronics (ST-Link, Nucleo)
        { usbVendorId: 0x239A }, // Adafruit
        { usbVendorId: 0x2341 }, // Arduino
        { usbVendorId: 0x1366 }, // SEGGER J-Link
        { usbVendorId: 0x303A }, // Espressif
        { usbVendorId: 0x2E8A }, // Raspberry Pi (Pico, RP2040)
      ]
    });
    return port;
  } catch (e) {
    if (e instanceof Error && e.name === 'NotFoundError') {
      return null;
    }
    throw e;
  }
}

/**
 * Start a background task that continuously reads from the port
 * and accumulates data into the connection's buffer
 */
function startReaderTask(connection: SerialConnection): void {
  if (!connection.port.readable) {
    console.error('[WebSerial] Port is not readable!');
    return;
  }

  const reader = connection.port.readable.getReader();
  const decoder = new TextDecoder();

  console.log('[WebSerial] Starting background reader...');

  connection._readerTask = (async () => {
    try {
      while (connection.isConnected) {
        console.log('[WebSerial] Waiting for data...');
        const { value, done } = await reader.read();
        console.log('[WebSerial] Read result - done:', done, 'bytes:', value?.length || 0);
        if (done) break;
        if (value) {
          const text = decoder.decode(value);
          console.log('[WebSerial] Received:', text);
          connection._rxBuffer += text;
          // Keep buffer from growing too large (keep last 10KB)
          if (connection._rxBuffer.length > 10000) {
            connection._rxBuffer = connection._rxBuffer.slice(-5000);
          }
        }
      }
    } catch (e) {
      if (connection.isConnected) {
        console.error('[WebSerial] Reader error:', e);
      }
    } finally {
      console.log('[WebSerial] Reader task ending');
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
    }
  })();
}

/**
 * Connect to a serial port
 */
export async function connect(
  port: SerialPort,
  baudRate: number = 115200
): Promise<SerialConnection> {
  await port.open({ baudRate });

  if (!port.readable || !port.writable) {
    throw new Error('Port is not readable/writable');
  }

  // Set DTR and RTS signals
  try {
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    console.log('[WebSerial] DTR/RTS signals set');
  } catch (e) {
    console.warn('[WebSerial] Could not set DTR/RTS signals:', e);
  }

  const writer = port.writable.getWriter();

  const connection: SerialConnection = {
    port,
    writer,
    isConnected: true,
    _rxBuffer: '',
    _readerTask: null,
    _abortController: new AbortController(),
  };

  // Start background reader
  startReaderTask(connection);

  // Give the device a moment to initialize
  await new Promise((r) => setTimeout(r, 200));

  // Send a few newlines to wake up the shell and trigger some output
  const encoder = new TextEncoder();
  console.log('[WebSerial] Sending wake-up newlines...');
  await writer.write(encoder.encode('\n\n\n'));

  // Wait for any response
  await new Promise((r) => setTimeout(r, 500));

  console.log('[WebSerial] After wake-up, buffer has:', connection._rxBuffer.length, 'bytes');
  console.log('[WebSerial] Buffer contents:', connection._rxBuffer.slice(0, 200));

  // Clear any startup messages
  connection._rxBuffer = '';
  console.log('[WebSerial] Connected and ready');

  return connection;
}

/**
 * Disconnect from a serial port
 */
export async function disconnect(connection: SerialConnection): Promise<void> {
  connection.isConnected = false;
  connection._abortController.abort();

  try {
    connection.writer.releaseLock();
  } catch {
    // Ignore
  }

  // Wait for reader task to finish
  if (connection._readerTask) {
    await connection._readerTask.catch(() => { });
  }

  try {
    await connection.port.close();
  } catch {
    // Ignore
  }
}

/**
 * Wait for a response matching our expected pattern
 * 
 * The Zephyr shell sends responses with various formats:
 * - Echo of the command (can be mixed with input)
 * - Response line starting with OK:, ERROR:, or WARN:
 * - Prompt (uart:~$ ) which may appear before/after response
 * 
 * We need to be flexible and find the response anywhere in the buffer.
 */
async function waitForResponse(
  connection: SerialConnection,
  timeoutMs: number = COMMAND_TIMEOUT_MS
): Promise<string> {
  const startTime = Date.now();

  // Regex to strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1B\[[0-9;]*[a-zA-Z]/g;
  
  // Regex to find response patterns anywhere in the buffer
  // Match OK:, ERROR:, or WARN: followed by anything until newline
  const responseRegex = /(OK:|ERROR:|WARN:)[^\r\n]*/;

  while (Date.now() - startTime < timeoutMs) {
    // Clean the buffer of ANSI codes first
    const cleanBuffer = connection._rxBuffer.replace(ansiRegex, '');
    
    // Search for response pattern anywhere in buffer
    const match = cleanBuffer.match(responseRegex);
    
    if (match) {
      const response = match[0].trim();
      console.log('[WebSerial] Found response:', response);
      
      // Find where this response ends in the buffer and clear up to there
      const responseEnd = cleanBuffer.indexOf(response) + response.length;
      // Find the next newline after the response
      const nextNewline = cleanBuffer.indexOf('\n', responseEnd);
      if (nextNewline >= 0) {
        connection._rxBuffer = cleanBuffer.slice(nextNewline + 1);
      } else {
        connection._rxBuffer = cleanBuffer.slice(responseEnd);
      }
      
      return response;
    }

    // Wait a bit before checking again
    await new Promise((r) => setTimeout(r, 50));
  }

  // Timeout - log what we received for debugging
  const cleanBuffer = connection._rxBuffer.replace(ansiRegex, '');
  console.error('[WebSerial] Timeout waiting for response.');
  console.error('[WebSerial] Buffer contents (cleaned):', cleanBuffer);
  console.error('[WebSerial] Buffer length:', cleanBuffer.length);
  throw new Error('Command timeout');
}

/**
 * Send a command and wait for response
 */
async function sendCommand(
  connection: SerialConnection,
  command: string
): Promise<string> {
  const encoder = new TextEncoder();

  // Clear buffer before sending
  connection._rxBuffer = '';

  // Send command with newline
  console.log('[WebSerial] Sending:', command);
  await connection.writer.write(encoder.encode(command + '\n'));

  // Give the device a moment to start processing
  await new Promise((r) => setTimeout(r, 50));

  // Wait for response
  const response = await waitForResponse(connection);
  console.log('[WebSerial] Response:', response);

  return response;
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
    // Clear any stale data in the buffer before starting
    connection._rxBuffer = '';
    
    // Send a newline to ensure shell is ready and clear any partial input
    const encoder = new TextEncoder();
    await connection.writer.write(encoder.encode('\n'));
    await new Promise((r) => setTimeout(r, 200));
    connection._rxBuffer = ''; // Clear the prompt that comes back
    
    // Step 1: Stop any running program
    notify('stopping', 0, 'Stopping current program...');
    const stopResponse = await sendCommand(connection, 'zplc stop');
    // Accept OK and WARN (WARN is returned if already stopped)
    if (stopResponse.startsWith('ERROR:')) {
      throw new Error(`Stop failed: ${stopResponse}`);
    }

    // Delay to let device settle
    await new Promise((r) => setTimeout(r, 200));

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
      // Delay before sending chunk to ensure device is ready
      // The Zephyr shell needs time to process each chunk
      await new Promise((r) => setTimeout(r, 100));

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
 */
export async function getStatus(connection: SerialConnection): Promise<string> {
  return await sendCommand(connection, 'zplc status');
}

/**
 * Reset the device
 */
export async function resetDevice(connection: SerialConnection): Promise<void> {
  await sendCommand(connection, 'zplc reset');
}

/**
 * Get device version
 */
export async function getVersion(connection: SerialConnection): Promise<string> {
  return await sendCommand(connection, 'zplc version');
}
