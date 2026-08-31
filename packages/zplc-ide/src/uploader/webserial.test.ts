import { describe, expect, it } from 'bun:test';

import type { SerialConnection } from './webserial';
import { connect, disconnect, uploadBytecode } from './webserial';

describe('uploadBytecode', () => {
  it('deploys legacy bytecode stopped without emitting zplc start', async () => {
    const transcript: string[] = [];
    const connection = {
      _rxBuffer: '',
      writer: {
        write: async (data: Uint8Array) => {
          const command = new TextDecoder().decode(data).trim();
          if (command) {
            transcript.push(command);
            connection._rxBuffer = 'OK: accepted\\n';
          }
        },
      },
    } as unknown as SerialConnection;
    const progress: string[] = [];

    await uploadBytecode(connection, new Uint8Array([0x01, 0x02]), (stage, _value, message) => {
      progress.push(`${stage}:${message}`);
    });

    expect(transcript).toEqual(['zplc stop', 'zplc load 2', 'zplc data 0102']);
    expect(transcript).not.toContain('zplc start');
    expect(progress.at(-1)).toBe('complete:Program deployed; execution remains stopped.');
  });
});

describe('disconnect', () => {
  it('leaves the connection closed and propagates a physical close failure', async () => {
    const closeError = new Error('close failed');
    const readerTerminations: string[] = [];
    const connection = {
      isConnected: true,
      _reader: null,
      _readerTask: null,
      writer: { releaseLock: () => undefined },
      port: { close: async () => { throw closeError; } },
      onReaderTerminated: (reason: string) => readerTerminations.push(reason),
    } as unknown as SerialConnection;

    await expect(disconnect(connection)).rejects.toBe(closeError);
    expect(connection.isConnected).toBe(false);
    expect(readerTerminations).toEqual([]);
  });
});

describe('connect', () => {
  it('closes a port opened without readable and writable streams', async () => {
    let closeCalls = 0;
    const port = {
      readable: null,
      writable: null,
      open: async () => undefined,
      close: async () => { closeCalls += 1; },
    } as unknown as SerialPort;

    await expect(connect(port)).rejects.toThrow('Port is not readable/writable');
    expect(closeCalls).toBe(1);
  });

  it('reports an unexpected reader completion once and marks the connection closed', async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const port = {
      readable: new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } }),
      writable: new WritableStream<Uint8Array>({ write: async () => undefined }),
      open: async () => undefined,
      close: async () => undefined,
      setSignals: async () => undefined,
    } as unknown as SerialPort;
    const connection = await connect(port);
    const terminations: string[] = [];
    connection.onReaderTerminated = (reason) => terminations.push(reason);

    streamController.close();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(connection.isConnected).toBe(false);
    expect(terminations).toEqual(['Serial reader terminated unexpectedly']);
  });
});
