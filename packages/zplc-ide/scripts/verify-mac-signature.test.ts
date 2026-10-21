import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAppBundle, parseCodesignDisplay, verifyMacBundle, type Exec } from './verify-mac-signature';

// These samples follow the documented layout of `codesign -dv --verbose=4`. They were written from that
// layout, not captured on a macOS runner: the first hosted run is what checks them against the real tool.
const sealedAdHocApp = (arch: string) => `Executable=/dist/mac-${arch}/ZPLC.app/Contents/MacOS/ZPLC
Identifier=com.zenithindustrialcloud.zplc
Format=app bundle with Mach-O thin (${arch})
CodeDirectory v=20500 size=637 flags=0x10002(adhoc,runtime) hashes=11+7 location=embedded
Hash type=sha256 size=32
CDHash=0123456789abcdef0123456789abcdef01234567
Signature=adhoc
Info.plist entries=22
TeamIdentifier=not set
Runtime Version=14.0.0
Sealed Resources version=2 rules=13 files=143
Internal requirements count=0 size=12
`;

const linkerSignedRuntime = `Executable=/dist/mac-arm64/ZPLC.app/Contents/Resources/native-runtime/zplc_runtime
Identifier=zplc_runtime
Format=Mach-O thin (arm64)
CodeDirectory v=20400 size=402 flags=0x20002(adhoc,linker-signed) hashes=9+0 location=embedded
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements count=0 size=12
`;

const resignedRuntime = linkerSignedRuntime.replace('0x20002(adhoc,linker-signed)', '0x10002(adhoc,runtime)');

// What rc.3 shipped on Apple silicon: only the linker signature on the main executable, nothing sealed.
const unsealedApp = `Executable=/dist/mac-arm64/ZPLC.app/Contents/MacOS/ZPLC
Identifier=zplc
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=402 flags=0x20002(adhoc,linker-signed) hashes=9+0 location=embedded
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements count=0 size=12
`;

const developerIdApp = `Executable=/dist/mac-arm64/ZPLC.app/Contents/MacOS/ZPLC
Identifier=com.zenithindustrialcloud.zplc
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=637 flags=0x10000(runtime) hashes=11+7 location=embedded
Signature size=9012
Authority=Developer ID Application: Someone (ABCDE12345)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=ABCDE12345
Sealed Resources version=2 rules=13 files=143
`;

const notSigned = '/dist/mac-arm64/ZPLC.app: code object is not signed at all\n';

describe('parseCodesignDisplay', () => {
  it('reads an ad-hoc, sealed, hardened bundle', () => {
    expect(parseCodesignDisplay(sealedAdHocApp('arm64'))).toEqual({
      signed: true,
      adHoc: true,
      flags: ['adhoc', 'runtime'],
      sealed: true,
      format: 'app bundle with Mach-O thin (arm64)',
    });
  });

  it('reads a linker-signed binary as ad hoc, linker-signed and not sealed', () => {
    expect(parseCodesignDisplay(linkerSignedRuntime)).toMatchObject({ adHoc: true, flags: ['adhoc', 'linker-signed'], sealed: false });
  });

  it('does not take a certificate signature for an ad-hoc one', () => {
    expect(parseCodesignDisplay(developerIdApp)).toMatchObject({ signed: true, adHoc: false, flags: ['runtime'] });
  });

  it('reads an unsigned object', () => {
    expect(parseCodesignDisplay(notSigned)).toEqual({ signed: false, adHoc: false, flags: [], sealed: false, format: undefined });
  });
});

/** A fake `codesign`: verification of every path succeeds unless listed, and -dv answers from a table. */
function fakeCodesign(display: Record<string, string>, failing: string[] = []): Exec {
  return (args) => {
    const path = args.at(-1)!;
    if (args[0] === '--verify') return failing.includes(path) ? { status: 1, output: `${path}: invalid signature` } : { status: 0, output: `${path}: valid on disk\n` };
    return display[path] === undefined ? { status: 1, output: notSigned } : { status: 0, output: display[path] };
  };
}

const app = '/dist/mac-arm64/ZPLC.app';
const runtime = `${app}/Contents/Resources/native-runtime/zplc_runtime`;

describe('verifyMacBundle', () => {
  it('accepts a sealed ad-hoc bundle whose nested runtime was signed with it', () => {
    expect(verifyMacBundle(app, 'arm64', fakeCodesign({ [app]: sealedAdHocApp('arm64'), [runtime]: resignedRuntime }))).toEqual([]);
  });

  it('accepts an Intel bundle for x64', () => {
    const intel = '/dist/mac/ZPLC.app';
    const nested = `${intel}/Contents/Resources/native-runtime/zplc_runtime`;
    expect(verifyMacBundle(intel, 'x64', fakeCodesign({ [intel]: sealedAdHocApp('x86_64'), [nested]: resignedRuntime.replace('arm64', 'x86_64') }))).toEqual([]);
  });

  it('rejects the unsealed bundle that rc.3 shipped', () => {
    const problems = verifyMacBundle(app, 'arm64', fakeCodesign({ [app]: unsealedApp, [runtime]: linkerSignedRuntime }));
    expect(problems).toContain('bundle: resources are not sealed');
    expect(problems).toContain('bundle: the hardened runtime flag is missing');
    expect(problems).toContain('native runtime: only the linker signature is present, the runtime was not signed with the bundle');
  });

  it('rejects a bundle that failed deep strict verification', () => {
    const problems = verifyMacBundle(app, 'arm64', fakeCodesign({ [app]: sealedAdHocApp('arm64'), [runtime]: resignedRuntime }, [app]));
    expect(problems.join('\n')).toContain(`bundle: codesign --verify --deep --strict failed: ${app}: invalid signature`);
  });

  it('rejects a certificate signature, because the pipeline has none to use', () => {
    expect(verifyMacBundle(app, 'arm64', fakeCodesign({ [app]: developerIdApp, [runtime]: resignedRuntime }))).toContain('bundle: Signature=adhoc is missing');
  });

  it('rejects an unsigned bundle and an unsigned runtime', () => {
    const problems = verifyMacBundle(app, 'arm64', fakeCodesign({}));
    expect(problems).toContain('bundle: not signed at all');
    expect(problems).toContain('native runtime: not signed at all');
  });

  it('rejects a bundle built for the other architecture', () => {
    expect(verifyMacBundle(app, 'x64', fakeCodesign({ [app]: sealedAdHocApp('arm64'), [runtime]: resignedRuntime }))).toContain(
      'bundle: expected a Mach-O thin (x86_64) bundle, codesign reports "app bundle with Mach-O thin (arm64)"',
    );
  });
});

describe('findAppBundle', () => {
  it('finds the one bundle under the per-architecture folder', () => {
    const dist = mkdtempSync(join(tmpdir(), 'zplc-find-app-'));
    try {
      mkdirSync(join(dist, 'mac-arm64', 'ZPLC.app'), { recursive: true });
      mkdirSync(join(dist, 'mac-arm64', 'other'), { recursive: true });
      expect(findAppBundle(dist)).toBe(join(dist, 'mac-arm64', 'ZPLC.app'));
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('refuses zero or several bundles', () => {
    const dist = mkdtempSync(join(tmpdir(), 'zplc-find-app-'));
    try {
      expect(() => findAppBundle(dist)).toThrow('exactly one');
      mkdirSync(join(dist, 'mac', 'a.app'), { recursive: true });
      mkdirSync(join(dist, 'mac-arm64', 'b.app'), { recursive: true });
      expect(() => findAppBundle(dist)).toThrow('exactly one');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
