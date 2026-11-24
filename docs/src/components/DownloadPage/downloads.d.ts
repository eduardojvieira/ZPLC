// Types of downloads.js, for the tests under tools/docs that import it.
export type DownloadOs = 'windows' | 'macos' | 'linux';
export type DownloadArch = 'x64' | 'arm64';
export type DownloadFormat = 'setup' | 'portable' | 'dmg' | 'zip' | 'deb' | 'rpm' | 'appimage';

export interface DownloadSystem {
  key: string;
  os: DownloadOs;
  arch: DownloadArch;
  formats: DownloadFormat[];
}

export interface DetectedSystem {
  os: DownloadOs;
  arch: DownloadArch | null;
}

export const SYSTEMS: DownloadSystem[];
export function fileName(version: string, format: DownloadFormat, arch: DownloadArch): string;
export function detectSystem(browser?: { userAgent?: string; architecture?: string; maxTouchPoints?: number }): DetectedSystem | null;
export function featuredSystems(detected: DetectedSystem | null): DownloadSystem[];
