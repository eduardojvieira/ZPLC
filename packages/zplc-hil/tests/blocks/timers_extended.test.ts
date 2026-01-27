import { HILTestCase } from '../../src/runner';

export const extendedTimerTests: HILTestCase[] = [
  {
    id: 'blocks.timers.tof',
    name: 'TOF: Off-Delay Timer',
    category: 'fb',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        timer1 : TOF;
        input : BOOL := FALSE;
        done : BOOL;
      END_VAR
      
      (* Test Sequence:
         1. Set input TRUE -> Q should be TRUE
         2. Set input FALSE -> Q should stay TRUE for 200ms
         3. Verify Q falls after 200ms
      *)
      timer1(IN := input, PT := T#200ms);
      done := timer1.Q;
      END_PROGRAM
    `,
    debugMode: 'summary',
    timeout: 5000,
    assertions: [
      {
        type: 'timing',
        timing: {
          afterMs: 200,
          tolerancePercent: 15
        }
      },
      {
        type: 'pattern',
        pattern: /"name":"TOF".*"q":true/
      },
      {
        type: 'pattern',
        pattern: /"name":"TOF".*"q":false/
      }
    ]
  },
  {
    id: 'blocks.timers.tp',
    name: 'TP: Pulse Timer',
    category: 'fb',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        timer1 : TP;
        trigger : BOOL := FALSE;
        pulse : BOOL;
      END_VAR
      
      timer1(IN := trigger, PT := T#300ms);
      pulse := timer1.Q;
      END_PROGRAM
    `,
    debugMode: 'summary',
    timeout: 5000,
    assertions: [
      {
        type: 'timing',
        timing: {
          afterMs: 300,
          tolerancePercent: 15
        }
      },
      {
        type: 'pattern',
        pattern: /"name":"TP".*"q":true/
      }
    ]
  }
];

export const counterTests: HILTestCase[] = [
  {
    id: 'blocks.counters.ctu',
    name: 'CTU: Count Up',
    category: 'fb',
    language: 'ST',
    source: `
      PROGRAM Test
      VAR
        count1 : CTU;
        up : BOOL := FALSE;
        rst : BOOL := FALSE;
        reached : BOOL;
      END_VAR
      
      count1(CU := up, R := rst, PV := 3);
      reached := count1.Q;
      END_PROGRAM
    `,
    debugMode: 'summary',
    timeout: 5000,
    assertions: [
      {
        type: 'pattern',
        pattern: /"name":"CTU".*"cv":3/
      },
      {
        type: 'pattern',
        pattern: /"name":"CTU".*"q":true/
      }
    ]
  }
];
