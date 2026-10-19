// Small stand-ins for the installers that the release tests build in a temporary folder.
import type { InstallerArch, InstallerFormat } from './verify-installers';

/** The smallest bytes that carry the signature of each container format. */
export function sample(format: InstallerFormat, arch: InstallerArch): Buffer {
  const bytes = Buffer.alloc(2048);
  if (format === 'dmg') bytes.write('koly', bytes.length - 512, 'latin1');
  else if (format === 'zip') bytes.write('PK\x03\x04', 'latin1');
  else if (format === 'setup' || format === 'portable') bytes.write('MZ', 'latin1');
  else if (format === 'appimage') { bytes.write('\x7fELF', 'latin1'); bytes[4] = 2; bytes[5] = 1; bytes.writeUInt16LE(arch === 'x64' ? 0x3e : 0xb7, 18); }
  else if (format === 'deb') bytes.write('!<arch>\ndebian-binary   ', 'latin1');
  else bytes.set([0xed, 0xab, 0xee, 0xdb]);
  return bytes;
}

