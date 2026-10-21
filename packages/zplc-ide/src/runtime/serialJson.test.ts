// The JSON reply of a shell command, found in the serial receive buffer (extracted from serialAdapter.ts).
import { describe, expect, it } from 'bun:test';

import { takeJsonReply } from './serialJson';

describe('the JSON reply of a shell command', () => {
  it('takes the first complete object after the echo of the command', () => {
    expect(takeJsonReply('zplc dbg trace status --json\r\n{"t":"trace","armed":false}\r\nuart:~$ ')).toEqual({ t: 'trace', armed: false });
    expect(takeJsonReply('{"t":"trace_dump","from":0,"samples":[[0,1,"01","00"]],"next":1}')).toEqual({
      t: 'trace_dump',
      from: 0,
      samples: [[0, 1, '01', '00']],
      next: 1,
    });
  });

  it('waits while the object is still arriving', () => {
    expect(takeJsonReply('zplc sys info --json\r\n{"board":"rpi_pico"')).toBeUndefined();
    expect(takeJsonReply('no reply yet')).toBeUndefined();
  });

  it('balances the extra brace older firmware prints before the stats object', () => {
    expect(takeJsonReply('{"uptime_ms":123,{"stats":{"cycles":4}}')).toEqual({ uptime_ms: 123, stats: { cycles: 4 } });
  });
});
