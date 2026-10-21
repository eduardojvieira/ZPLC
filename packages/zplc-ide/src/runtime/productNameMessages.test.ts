import { describe, expect, it } from 'bun:test';

import { describeFirmware } from './link/firmwareProtocol';
import { wasmCapabilityProfile } from './wasmCapabilities';

// UX-030, DOC-017: a message a person reads names the product ZPLC (decision D-03), never "Studio".
describe('UX-030 DOC-017 the messages that reach a person name the product ZPLC', () => {
  it('UX-030 the firmware report speaks of ZPLC in the three answers a device can give', () => {
    const info = { zplc_version: '2.0.0', device_protocol_version: 1 };
    const framed = describeFirmware({ studioVersion: '2.1.0', hello: { version: 1, capabilities: 0 } as never, systemInfo: info });
    const shellOnly = describeFirmware({ studioVersion: '2.1.0', hello: null, systemInfo: info });
    const unknown = describeFirmware({ studioVersion: '2.1.0', hello: null, systemInfo: null });
    for (const report of [framed, shellOnly, unknown]) expect(report.message).not.toMatch(/\bStudio\b/);
    expect(framed.message).toContain('this ZPLC is 2.1.0');
    expect(shellOnly.message).toContain('built from the same source as this ZPLC');
    expect(unknown.message).toContain('the text shell this ZPLC reads');
  });

  it('UX-030 the browser capability profile says which process image ZPLC reads and writes', () => {
    const text = JSON.stringify(wasmCapabilityProfile());
    expect(text).toContain('process image that ZPLC reads and writes');
    expect(text).not.toMatch(/\bStudio\b/);
  });
});
