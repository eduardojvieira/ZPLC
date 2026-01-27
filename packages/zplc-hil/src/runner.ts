import { Device, DebugFrame } from './device';
import { DebugFrame as ProtocolFrame } from './protocol';
import { assertPattern, assertValue, assertError, assertTiming, assertNoError, TimingSpec } from './assertions';

export type TestCategory = 'opcode' | 'fb' | 'scheduler' | 'language' | 'debug';
export type TestLanguage = 'ST' | 'LD' | 'FBD' | 'SFC';
export type DebugMode = 'off' | 'summary' | 'verbose';

export interface Assertion {
  type: 'pattern' | 'timing' | 'error' | 'value' | 'no_error';
  pattern?: RegExp;
  timing?: TimingSpec;
  address?: number;
  expected?: any;
  tolerance?: number;
  code?: number; // for error assertion
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
  frames: ProtocolFrame[];
  error?: string;
  failedAssertion?: Assertion;
}

export interface RunnerOptions {
  compilerPath?: string;
  uploadTimeout?: number;
}

export class TestRunner {
  private device: Device;
  private options: RunnerOptions;

  constructor(device: Device, options: RunnerOptions = {}) {
    this.device = device;
    this.options = options;
  }

  async runTest(test: HILTestCase): Promise<TestResult> {
    const maxRetries = test.retries ?? 3;
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      attempt++;
      try {
        const result = await this.executeTest(test, attempt);
        if (result.status === 'pass' || attempt > maxRetries) {
          return result;
        }
        // If failed and retries left, clean up and retry
        try {
            this.device.send('zplc reset'); 
        } catch (e) {
            // Ignore if send fails during reset
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        if (attempt > maxRetries) {
          return {
            testId: test.id,
            status: 'error',
            duration: 0,
            attempts: attempt,
            frames: [],
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }
    }
    
    return {
        testId: test.id,
        status: 'error',
        duration: 0,
        attempts: attempt,
        frames: [],
        error: 'Unknown error'
    };
  }

  private async executeTest(test: HILTestCase, attempt: number): Promise<TestResult> {
    const frames: ProtocolFrame[] = [];
    const startTime = Date.now();

    // 1. Compile (Mocked)
    // 2. Upload (Mocked)
    
    // 3. Configure Debug Mode
    this.device.send(`zplc hil mode ${test.debugMode}`);
    
    // 4. Start Execution
    // If resetting, maybe 'zplc reset' first?
    this.device.send('zplc reset');
    await new Promise(r => setTimeout(r, 100));
    
    // If source is hex, load it. If not, assume it's built-in or already loaded.
    // For T4.1 "Hello HIL", we might need to load something.
    // For now, just assume we run whatever is there or send a command.
    
    this.device.send('zplc start'); 
    
    // 5. Capture Frames
    await new Promise<void>((resolve) => {
        const timeoutMs = test.timeout ?? 5000;
        
        const frameHandler = (frame: any) => { 
            frames.push(frame);
            // Stop on HALT or error
            if (frame.type === 'opcode' && frame.payload.op === 'HALT') {
                // We might want to wait a bit more for pending frames?
            }
            if (frame.type === 'error' && frame.payload.msg === 'HALTED') {
                resolve();
            }
        };

        const cleanup = () => {
            this.device.off('frame', frameHandler);
        };

        this.device.on('frame', frameHandler);
        
        // Timeout
        setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);
    });

    const duration = Date.now() - startTime;

    // 6. Check Assertions
    for (const assertion of test.assertions) {
        let passed = false;
        
        switch (assertion.type) {
            case 'pattern':
                if (assertion.pattern) passed = assertPattern(frames, assertion.pattern);
                break;
            case 'value':
                if (assertion.address !== undefined) passed = assertValue(frames, assertion.address, assertion.expected);
                break;
            case 'error':
                if (assertion.code !== undefined) passed = assertError(frames, assertion.code);
                break;
            case 'no_error':
                passed = assertNoError(frames);
                break;
            case 'timing':
                if (assertion.timing) passed = assertTiming(frames, assertion.timing);
                break;
        }

        if (!passed) {
            return {
                testId: test.id,
                status: 'fail',
                duration,
                attempts: attempt,
                frames,
                failedAssertion: assertion,
                error: `Assertion failed: ${assertion.type}`
            };
        }
    }

    return {
        testId: test.id,
        status: 'pass',
        duration,
        attempts: attempt,
        frames
    };
  }
}
