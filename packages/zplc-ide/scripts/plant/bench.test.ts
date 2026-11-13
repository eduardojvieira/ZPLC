import { describe, expect, it } from 'bun:test';
import {
  buildRecord,
  editorLatencyVerdict,
  frameStats,
  frameVerdict,
  hostRecord,
  identityLeaks,
  percentile,
  RECORD_SCHEMA,
  recordFileName,
  stepVerdict,
  summarise,
} from './benchRecord';

const raw = {
  platform: 'linux',
  arch: 'x64',
  cpuModel: ' AMD Ryzen 5 8600G w/ Radeon 760M Graphics ',
  gpu: 'ANGLE (AMD, Radeon 760M)',
  memoryBytes: 64 * 2 ** 30,
  screen: { width: 1920, height: 1080, refreshHz: 60 },
};

describe('the plant bench record', () => {
  it('VIS-004 the record names platform, arch, cpu and gpu and no host or user name', () => {
    const host = hostRecord(raw);
    expect(host).toEqual({
      platform: 'linux',
      arch: 'x64',
      cpu: 'AMD Ryzen 5 8600G w/ Radeon 760M Graphics',
      gpu: 'ANGLE (AMD, Radeon 760M)',
      memoryGb: 64,
      screen: { width: 1920, height: 1080, refreshHz: 60 },
    });
    expect(Object.keys(host).sort()).toEqual(['arch', 'cpu', 'gpu', 'memoryGb', 'platform', 'screen']);
    const record = buildRecord({ commit: 'abc', dirtyTree: false, started: 's', finished: 'f', host, sequences: {} });
    expect(identityLeaks(record, ['someone-pc', 'someuser'])).toEqual([]);
    expect(identityLeaks({ ...record, note: 'from someone-pc' }, ['someone-pc', 'someuser'])).toEqual(['someone-pc']);
    expect(recordFileName(host)).toBe('bench-linux-x64.json');
  });

  it('VIS-004 a machine whose gpu is unknown says so instead of leaving the field out', () => {
    expect(hostRecord({ ...raw, gpu: null }).gpu).toBe('unavailable');
  });

  it('PLT-015 the p95 of an empty sample is an error, not zero', () => {
    expect(() => percentile([], 0.95)).toThrow(RangeError);
    expect(() => summarise([])).toThrow(RangeError);
  });

  it('PLT-015 the p95 is the nearest rank', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 0.5)).toBe(50);
    expect(percentile(hundred, 0.95)).toBe(95);
    expect(summarise([3, 1, 2])).toEqual({ samples: 3, p50: 2, p95: 3, max: 3 });
  });

  it('VIS-004 the record schema is stable', () => {
    const host = hostRecord(raw);
    const record = buildRecord({
      commit: 'abc',
      dirtyTree: true,
      started: '2026-11-12T00:00:00.000Z',
      finished: '2026-11-12T00:01:00.000Z',
      host,
      sequences: { capacity: { verdict: 'pass' } },
    });
    expect(RECORD_SCHEMA).toBe('zplc.plant-bench/1');
    expect(Object.keys(record)).toEqual(['schema', 'commit', 'dirtyTree', 'started', 'finished', 'host', 'sequencesRun', 'sequences']);
    expect(record.sequencesRun).toEqual(['capacity']);
  });

  it('VIS-004 sixty frames a second typical, never below thirty, is the verdict of a frame run', () => {
    const at60 = Array.from({ length: 3601 }, (_, i) => (i * 1000) / 60);
    const steady = frameStats(at60);
    expect(steady.medianFrameMs).toBeCloseTo(16.667, 2);
    expect(steady.worstSecondFps).toBeGreaterThanOrEqual(59);
    expect(frameVerdict(steady)).toBe('pass');
    // 25 frames a second throughout: median 40 ms, worst second 25
    const slow = frameStats(Array.from({ length: 1501 }, (_, i) => i * 40));
    expect(slow.worstSecondFps).toBeLessThan(30);
    expect(frameVerdict(slow)).toBe('fail');
    // 60 fps with one stalled second of 20 frames: typical is fine, the worst second is not
    const stalled = [
      ...at60.slice(0, 1800),
      ...Array.from({ length: 20 }, (_, i) => 30_000 + 50 * i),
      ...at60.slice(1800).map((t) => t + 31_000),
    ];
    expect(frameVerdict(frameStats(stalled))).toBe('fail');
  });

  it('VIS-004 a run with too few frames to judge is an error, not a pass', () => {
    expect(() => frameStats([0])).toThrow(RangeError);
  });

  it('PLT-015 the editor passes at 100 ms or less at the 95th percentile, and only with every key press measured', () => {
    expect(editorLatencyVerdict({ keys: 500, expectedKeys: 500, p95Ms: 100 })).toBe('pass');
    expect(editorLatencyVerdict({ keys: 500, expectedKeys: 500, p95Ms: 100.1 })).toBe('fail');
    expect(editorLatencyVerdict({ keys: 480, expectedKeys: 500, p95Ms: 20 })).toBe('fail');
  });

  it('PLT-014 the headless step passes under 8 ms at the 95th percentile and a real-time factor above 1', () => {
    expect(stepVerdict({ p95Ms: 7.9, realTimeFactor: 1.2 })).toBe('pass');
    expect(stepVerdict({ p95Ms: 8, realTimeFactor: 1.2 })).toBe('fail');
    expect(stepVerdict({ p95Ms: 3, realTimeFactor: 0.9 })).toBe('fail');
  });
});
