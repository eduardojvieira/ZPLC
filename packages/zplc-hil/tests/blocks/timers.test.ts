import { HILTestCase } from '../../src/runner';

export const timerTests: HILTestCase[] = [
  {
    id: 'blocks.timers.ton',
    name: 'TON: On-Delay Timer',
    category: 'fb',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        timer1 : TON;
        start : BOOL := FALSE;
        done : BOOL;
      END_VAR
      timer1(IN := start, PT := T#100ms);
      done := timer1.Q;
      END_PROGRAM
    `,
    debugMode: 'summary',
    timeout: 5000,
    assertions: [
      {
        type: 'timing',
        timing: {
          afterMs: 100,
          tolerancePercent: 15
        }
      }
    ]
  }
];
