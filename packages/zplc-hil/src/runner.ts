import { compileSource } from './compile';
import type { Compiled } from './compile';
import { assertError, assertNoError, assertPattern, assertTiming, assertValue } from './assertions';
import type { TimingSpec } from './assertions';
import type { DeviceLink } from './link';
import { parseFrame } from './protocol';
import type { DebugFrame } from './protocol';

export type TestCategory = 'opcode' | 'fb' | 'scheduler' | 'language' | 'debug';
export type TestLanguage = 'ST' | 'LD' | 'FBD' | 'SFC' | 'IL';
export type DebugMode = 'off' | 'summary' | 'verbose';

export interface Assertion {
  type: 'pattern' | 'timing' | 'error' | 'value' | 'no_error' | 'memory';
  pattern?: RegExp;
  timing?: TimingSpec;
  address?: number;
  expected?: number | boolean | number[];
  tolerance?: number;
  code?: number;
}

export interface HILTestCase {
  id: string;
  name: string;
  category: TestCategory;
  language: TestLanguage;
  source: string;
  debugMode: DebugMode;
  timeout?: number;
  retries?: number;
  assertions: Assertion[];
}

export interface TestResult {
  testId: string;
  status: 'pass' | 'fail' | 'skip' | 'error';
  duration: number;
  attempts: number;
  frames: DebugFrame[];
  error?: string;
  failedAssertion?: Assertion;
  /** SHA-256 of the artifact that was deployed, for the record. */
  programSha256?: string;
}

export interface RunnerOptions {
  /** Compile a test's source; the default is the repository compiler. A test passes its own to count compilations. */
  compile?: (test: HILTestCase) => Compiled;
  /** Pause after a start before the assertions are read, for a program that needs scans to settle. */
  settleMs?: number;
}

export interface TraceModeLink extends DeviceLink {
  setTraceMode?(mode: DebugMode): Promise<void>;
}

const EXTENSION: Record<TestLanguage, '.st' | '.il' | undefined> = { ST: '.st', IL: '.il', LD: undefined, FBD: undefined, SFC: undefined };

export function compileTest(test: HILTestCase): Compiled {
  const extension = EXTENSION[test.language];
  if (!extension) throw new Error(`${test.id}: a ${test.language} test names a source file, and this table holds source text`);
  return compileSource({ text: test.source, extension });
}

/**
 * Compile with the repository compiler, deploy through the device link, start, observe and judge (HIL-001). Every step
 * is a real one: nothing is mocked, and a device that does not deploy, run or answer is an error of the test.
 */
export class TestRunner {
  private readonly link: TraceModeLink;
  private readonly options: RunnerOptions;

  constructor(link: DeviceLink, options: RunnerOptions = {}) {
    this.link = link;
    this.options = options;
  }

  async runTest(test: HILTestCase): Promise<TestResult> {
    const maxRetries = test.retries ?? 0;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let result: TestResult;
      try {
        result = await this.executeTest(test, attempt);
      } catch (error) {
        result = {
          testId: test.id,
          status: 'error',
          duration: 0,
          attempts: attempt,
          frames: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (result.status === 'pass' || attempt > maxRetries) return result;
      await this.link.stop().catch(() => undefined);
    }
  }

  private async executeTest(test: HILTestCase, attempt: number): Promise<TestResult> {
    const started = Date.now();
    const compiled = (this.options.compile ?? compileTest)(test);
    const frames: DebugFrame[] = [];
    const stopListening = this.link.onTrace?.((line) => {
      const frame = parseFrame(line);
      if (frame) frames.push(frame);
    });
    try {
      await this.link.load(compiled.zplc);
      await this.link.setTraceMode?.(test.debugMode);
      await this.link.reset();
      await this.link.start();
      // run until the program halts (a HALTED frame) or the observation window ends
      const window = this.options.settleMs ?? Math.min(test.timeout ?? 500, 5000);
      for (let waited = 0; waited < window && !frames.some((f) => f.payload.t === 'error' && f.payload.msg === 'HALTED'); waited += 10) {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      }
      const memory = new Map<number, Uint8Array>();
      for (const assertion of test.assertions) {
        if (assertion.type === 'memory' && assertion.address !== undefined) {
          const wanted = Array.isArray(assertion.expected) ? assertion.expected.length : 1;
          // while it runs: STOP puts the outputs in their safe state
          memory.set(assertion.address, await this.link.peek(assertion.address, wanted));
        }
      }
      await this.link.stop();
      for (const assertion of test.assertions) {
        if (!this.judge(assertion, frames, memory)) {
          return {
            testId: test.id,
            status: 'fail',
            duration: Date.now() - started,
            attempts: attempt,
            frames,
            failedAssertion: assertion,
            error: `Assertion failed: ${assertion.type}`,
            programSha256: compiled.sha256,
          };
        }
      }
      return { testId: test.id, status: 'pass', duration: Date.now() - started, attempts: attempt, frames, programSha256: compiled.sha256 };
    } finally {
      stopListening?.();
    }
  }

  private judge(assertion: Assertion, frames: DebugFrame[], memory: Map<number, Uint8Array>): boolean {
    switch (assertion.type) {
      case 'pattern':
        return assertion.pattern !== undefined && assertPattern(frames, assertion.pattern);
      case 'value':
        return assertion.address !== undefined && assertValue(frames, assertion.address, assertion.expected);
      case 'error':
        return assertion.code !== undefined && assertError(frames, assertion.code);
      case 'no_error':
        return assertNoError(frames);
      case 'timing':
        return assertion.timing !== undefined && assertTiming(frames, assertion.timing);
      case 'memory': {
        const read = assertion.address === undefined ? undefined : memory.get(assertion.address);
        if (!read) return false;
        const wanted = Array.isArray(assertion.expected) ? assertion.expected : [Number(assertion.expected)];
        return wanted.length === read.length && wanted.every((byte, index) => byte === read[index]);
      }
    }
  }
}
