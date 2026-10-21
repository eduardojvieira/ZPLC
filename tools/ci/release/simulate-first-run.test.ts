// The pure parts of tools/ci/release/simulate-first-run.ts (REL-016). The simulation itself needs installers, Wine and a
// display: it is run by hand and its record is committed; these tests pin the parts that read and judge that record.
import { expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { APP_ID, plistString, scrub, STATEMENT, summarize, type Step } from './simulate-first-run';

test('counts the steps by status', () => {
  const step = (status: Step['status']): Step => ({ os: 'linux', id: status, status, detail: '' });
  expect(summarize([step('pass'), step('pass'), step('fail'), step('not-simulated')])).toEqual({ pass: 2, fail: 1, 'not-simulated': 1 });
});

test('reads a string of an Info.plist, the first one, and nothing that is not a string', () => {
  const xml = '<dict><key>CFBundleName</key>\n  <string>ZPLC</string><key>CFBundleIdentifier</key><string>' + APP_ID + '</string><key>X</key><true/><key>CFBundleName</key><string>Other</string></dict>';
  expect(plistString(xml, 'CFBundleName')).toBe('ZPLC');
  expect(plistString(xml, 'CFBundleIdentifier')).toBe('com.zenithindustrialcloud.zplc');
  expect(plistString(xml, 'X')).toBeUndefined();
});

test('the record never carries the home folder, and says in words that it is a simulation', () => {
  expect(scrub(`${homedir()}/.cache/zplc-rel016/dist`)).toBe('~/.cache/zplc-rel016/dist');
  expect(STATEMENT).toBe('Simulated on Linux by owner decision 2026-10-20, not a real Mac or Windows machine.');
});
