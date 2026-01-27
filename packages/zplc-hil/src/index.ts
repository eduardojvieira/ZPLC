/**
 * @zplc/hil - Hardware-in-the-Loop Testing Framework
 */

export const VERSION = '0.1.0';

export * from './device';
export * from './protocol';
export * from './runner';
export * from './assertions';
export * from './reporter';

import { Device, connect as deviceConnect, ConnectionOptions } from './device';
import { HILTestCase, TestRunner, TestResult } from './runner';

export interface TestSuite {
  name: string;
  tests: HILTestCase[];
  setup?: string;
  teardown?: string;
}

export async function run(test: HILTestCase, options: { port: string, baudRate?: number }): Promise<TestResult> {
    const device = await deviceConnect(options.port, { baudRate: options.baudRate });
    try {
        const runner = new TestRunner(device);
        return await runner.runTest(test);
    } finally {
        await device.close();
    }
}

export async function runSuite(suite: TestSuite, options: { port: string, baudRate?: number, failFast?: boolean }): Promise<TestResult[]> {
    const device = await deviceConnect(options.port, { baudRate: options.baudRate });
    const results: TestResult[] = [];
    try {
        const runner = new TestRunner(device);
        
        // TODO: Handle setup
        
        for (const test of suite.tests) {
            const result = await runner.runTest(test);
            results.push(result);
            if (options.failFast && result.status !== 'pass') break;
        }
        
        // TODO: Handle teardown
        
        return results;
    } finally {
        await device.close();
    }
}
