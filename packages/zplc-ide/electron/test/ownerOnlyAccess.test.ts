import { describe, expect, test } from 'bun:test';

import { OTHER_USERS, aclGrantsReadTo } from './ownerOnlyAccess';

// The real listing of the recovery file on the Windows runner (nightly 45866096611), path shortened.
const RUNNER = [
  'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\zplc-recovery-x\\recovery\\ab\\cd.json NT AUTHORITY\\SYSTEM:(F)',
  '                                                                       BUILTIN\\Administrators:(F)',
  '                                                                       fv-az123\\runneradmin:(F)',
  '',
  'Successfully processed 1 files; Failed processing 0 files',
].join('\r\n');

const withEntry = (entry: string) => RUNNER.replace('BUILTIN\\Administrators:(F)', `BUILTIN\\Administrators:(F)\r\n    ${entry}`);

describe('aclGrantsReadTo (owner decision 7)', () => {
  test('the runner listing gives no read to Users or Everyone', () => {
    expect(aclGrantsReadTo(RUNNER, OTHER_USERS)).toBe(false);
  });

  test('an inherited read and execute for BUILTIN\\Users is a read', () => {
    expect(aclGrantsReadTo(withEntry('BUILTIN\\Users:(I)(RX)'), OTHER_USERS)).toBe(true);
  });

  test('Everyone with read is a read, also on the first line after the path', () => {
    expect(aclGrantsReadTo(withEntry('Everyone:(R)'), OTHER_USERS)).toBe(true);
    expect(aclGrantsReadTo('C:\\Users\\ana\\a.json Everyone:(OI)(CI)(R,W)\r\n', OTHER_USERS)).toBe(true);
  });

  test('full control for SYSTEM and Administrators only is not a read for the others', () => {
    const listing = 'C:\\Users\\ana\\a.json NT AUTHORITY\\SYSTEM:(F)\r\n                     BUILTIN\\Administrators:(F)\r\n';
    expect(aclGrantsReadTo(listing, OTHER_USERS)).toBe(false);
    expect(aclGrantsReadTo(listing, ['BUILTIN\\Administrators'])).toBe(true);
  });

  test('a right without read and a DENY entry grant nothing', () => {
    expect(aclGrantsReadTo(withEntry('BUILTIN\\Users:(I)(W)'), OTHER_USERS)).toBe(false);
    expect(aclGrantsReadTo(withEntry('Everyone:(DENY)(R)'), OTHER_USERS)).toBe(false);
    expect(aclGrantsReadTo(withEntry('NT AUTHORITY\\Authenticated Users:(I)(M)'), OTHER_USERS)).toBe(true);
  });
});
