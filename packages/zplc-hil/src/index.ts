/**
 * @zplc/hil - Hardware-in-the-Loop Testing Framework
 *
 * What it does with a board is always started by a person (HIL-003): `cli.ts` is the command and it refuses to run
 * without an interactive terminal. Nothing exported here is reachable from MCP or an AI tool.
 */

export const VERSION = '2.0.0-rc.3';

export * from './link';
export * from './shellLink';
export * from './hostLink';
export * from './hardwarePort';
export * from './guard';
export * from './ports';
export * from './record';
export * from './compile';
export * from './protocol';
export * from './runner';
export * from './assertions';
export * from './reporter';
export { Device, listDevices, connect } from './device';

import { selectPort } from './ports';
import { TestRunner } from './runner';
import type { HILTestCase, RunnerOptions, TestResult } from './runner';
import { listSerialPorts, SerialShellTransport } from './serialTransport';
import { ShellLink } from './shellLink';
import type { DeviceLink } from './link';

export interface TestSuite {
  name: string;
  tests: HILTestCase[];
}

/** Open the serial link of a board: the port is a parameter, ZPLC_SERIAL_PORT, or found from the USB identifiers of the board. */
export async function openSerialLink(options: { port?: string; board?: string; baudRate?: number }): Promise<DeviceLink> {
  const listed = await listSerialPorts();
  const path = selectPort({ port: options.port, board: options.board, env: process.env, listed: () => listed });
  return new ShellLink(await SerialShellTransport.open(path, options.baudRate), 'serial');
}

export async function run(test: HILTestCase, link: DeviceLink, options: RunnerOptions = {}): Promise<TestResult> {
  return new TestRunner(link, options).runTest(test);
}

export async function runSuite(suite: TestSuite, link: DeviceLink, options: RunnerOptions & { failFast?: boolean } = {}): Promise<TestResult[]> {
  const runner = new TestRunner(link, options);
  const results: TestResult[] = [];
  for (const test of suite.tests) {
    const result = await runner.runTest(test);
    results.push(result);
    if (options.failFast && result.status !== 'pass') break;
  }
  return results;
}
