// What the download page offers: the installers of a release, named as the release pipeline names them
// (tools/ci/release/verify-installers.ts, installerName; tools/docs/download_page.test.ts compares the two), and the
// system of the visitor, read from the browser.

/** The installers of one system, the recommended one first. */
export const SYSTEMS = [
  { key: 'win-x64', os: 'windows', arch: 'x64', formats: ['setup', 'portable'] },
  { key: 'win-arm64', os: 'windows', arch: 'arm64', formats: ['setup', 'portable'] },
  { key: 'mac-arm64', os: 'macos', arch: 'arm64', formats: ['dmg', 'zip'] },
  { key: 'mac-x64', os: 'macos', arch: 'x64', formats: ['dmg', 'zip'] },
  { key: 'linux-x64', os: 'linux', arch: 'x64', formats: ['deb', 'rpm', 'appimage'] },
  { key: 'linux-arm64', os: 'linux', arch: 'arm64', formats: ['deb', 'rpm', 'appimage'] },
];

const FORMATS = {
  dmg: { os: 'mac', ext: 'dmg' },
  zip: { os: 'mac', ext: 'zip' },
  setup: { os: 'win', ext: 'exe', variant: 'setup-unsigned' },
  portable: { os: 'win', ext: 'exe', variant: 'portable-unsigned' },
  appimage: { os: 'linux', ext: 'AppImage', arch: { x64: 'x86_64', arm64: 'arm64' } },
  deb: { os: 'linux', ext: 'deb', arch: { x64: 'amd64', arm64: 'arm64' } },
  rpm: { os: 'linux', ext: 'rpm', arch: { x64: 'x86_64', arm64: 'aarch64' } },
};

/** `zplc-2.0.0-linux-amd64.deb`: each Linux package system spells the architecture its own way. */
export function fileName(version, format, arch) {
  const { os, ext, variant, arch: spelling } = FORMATS[format];
  return `zplc-${version}-${os}-${spelling ? spelling[arch] : arch}${variant ? `-${variant}` : ''}.${ext}`;
}

/**
 * `{ os, arch }` of the browser, with `arch` null when it cannot be known, or null where ZPLC does not install (a phone,
 * a tablet, a Chromebook). `architecture` comes from `navigator.userAgentData` where the browser has it (Chromium);
 * every Mac browser writes "Intel" in its user agent, so only that value tells an Apple silicon Mac from an Intel one.
 */
export function detectSystem({ userAgent = '', architecture = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod|cros/.test(ua)) return null;
  const reported = architecture === 'arm' ? 'arm64' : architecture === 'x86' ? 'x64' : null;
  if (ua.includes('windows')) return { os: 'windows', arch: reported ?? (/arm64|aarch64/.test(ua) ? 'arm64' : 'x64') };
  // an iPad asks for the desktop site with a Mac user agent; only its touch screen tells it apart
  if (ua.includes('macintosh')) return maxTouchPoints > 1 ? null : { os: 'macos', arch: reported };
  if (ua.includes('linux')) return { os: 'linux', arch: reported ?? (/aarch64|arm64/.test(ua) ? 'arm64' : 'x64') };
  return null;
}

/** The systems to offer first: the detected one, or both Macs when the architecture of a Mac is unknown. */
export function featuredSystems(detected) {
  if (detected === null) return [];
  return SYSTEMS.filter((system) => system.os === detected.os && (detected.arch === null || system.arch === detected.arch));
}
