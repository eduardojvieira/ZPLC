/**
 * Owner decision 7: what "only the owner can read it" means for the session, recent-projects and recovery files on each
 * system. Linux and macOS check the mode bits; Windows has none to check, so there the file (or folder) must live inside
 * the user profile and its ACL must give no read right to the other users. The ACL is only read with icacls, never
 * changed: a recovery copy can hold a zplc.json with passwords.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import { expect } from 'bun:test';

/** The principals that stand for the other users of the machine. */
export const OTHER_USERS = ['BUILTIN\\Users', 'Users', 'Everyone', 'NT AUTHORITY\\Authenticated Users'] as const;

/** The icacls rights that include reading: full, modify, read and execute, read, generic read and all, read data. */
const READ_RIGHTS = new Set(['F', 'M', 'RX', 'R', 'GR', 'GA', 'RD']);

/**
 * Whether an icacls listing grants read to any of the principals. Each entry is `<principal>:(flag)...(rights)`; the first
 * line puts the target path before it. Inheritance flags such as (I), (OI) and (CI) are ignored, and a (DENY) entry
 * grants nothing.
 */
export function aclGrantsReadTo(icaclsOutput: string, principals: readonly string[]): boolean {
  const wanted = principals.map((principal) => principal.toLowerCase());
  return icaclsOutput.split(/\r?\n/).some((line) => {
    const entry = /^(.*?):((?:\([^)]*\))+)\s*$/.exec(line.trim());
    if (!entry) return false;
    const who = entry[1]!.toLowerCase();
    if (!wanted.some((principal) => who === principal || who.endsWith(` ${principal}`))) return false;
    const groups = [...entry[2]!.matchAll(/\(([^)]*)\)/g)].map((group) => group[1]!.toUpperCase());
    if (groups.includes('DENY')) return false;
    return groups.some((group) => group.split(',').some((right) => READ_RIGHTS.has(right.trim())));
  });
}

/** Canonical long path, lower case: resolves 8.3 short names such as RUNNER~1 and links. */
const canonical = (path: string) => realpathSync.native(path).toLowerCase();

/** Expects `path` to be readable by its owner only: `mode` on Linux and macOS, the profile and the ACL on Windows. */
export function expectOwnerOnly(path: string, mode: number): void {
  if (process.platform !== 'win32') {
    expect(statSync(path).mode & 0o777).toBe(mode);
    return;
  }
  const profile = process.env.USERPROFILE;
  expect(profile).toBeTruthy();
  expect(canonical(path).startsWith(canonical(profile!) + sep)).toBe(true);
  const acl = spawnSync('icacls', [path], { encoding: 'utf8', shell: false });
  expect(acl.status).toBe(0);
  expect(aclGrantsReadTo(acl.stdout, OTHER_USERS)).toBe(false);
}
