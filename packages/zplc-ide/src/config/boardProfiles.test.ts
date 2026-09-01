import { describe, expect, test } from 'bun:test';
import supportedBoardsManifest from '../../../../firmware/app/boards/supported-boards.v1.5.0.json';

import {
  BOARD_OPTIONS,
  getBoardEvidenceSummary,
  getBoardNetworkType,
  getCompilerMemoryProfile,
  getZephyrBoardTarget,
  isKnownBoardTarget,
  isKnownZephyrBoardTarget,
  normalizeNetworkConfigForBoard,
} from './boardProfiles';

describe('board network profile mapping', () => {
  test('projects only the six catalogued evidence tiers and counts', () => {
    const catalogue = (supportedBoardsManifest as Array<{ ide_id: string }>).map((board) => board.ide_id);
    expect(catalogue).toHaveLength(6);
    expect(catalogue.every((id) => getBoardEvidenceSummary(id)?.validationLevel === 'cross-build')).toBe(true);
    expect(catalogue.every((id) => getBoardEvidenceSummary(id)?.evidenceCount === 0)).toBe(true);
    expect(getBoardEvidenceSummary('custom')).toBeUndefined();
    expect(getBoardEvidenceSummary('unknown')).toBeUndefined();
  });
  test('maps manifest-declared network boards correctly', () => {
    expect(getBoardNetworkType('esp32s3_devkitc')).toBe('wifi');
    expect(getBoardNetworkType('arduino_giga_r1')).toBe('none');
    expect(getBoardNetworkType('stm32f746g_disco')).toBe('ethernet');
    expect(getBoardNetworkType('nucleo_h743zi')).toBe('ethernet');
  });

  test('keeps board options aligned with the supported-board manifest', () => {
    const manifestBoardIds = (supportedBoardsManifest as Array<{ ide_id: string }>).map(
      (entry) => entry.ide_id
    );
    const optionIds = BOARD_OPTIONS.map((option) => option.value).filter(
      (value) => value && value !== 'custom'
    );

    expect(optionIds).toEqual(manifestBoardIds);
  });

  test('returns none for unknown or non-network boards', () => {
    expect(getBoardNetworkType('rpi_pico')).toBe('none');
    expect(getBoardNetworkType('custom')).toBe('none');
    expect(getBoardNetworkType(undefined)).toBe('none');
  });

  test('maps all IDE board IDs to their exact canonical Zephyr targets', () => {
    expect(Object.fromEntries([
      'rpi_pico', 'arduino_giga_r1', 'esp32s3_devkitc',
      'stm32f746g_disco', 'nucleo_h743zi', 'arduino_opta_wifi',
    ].map((id) => [id, getZephyrBoardTarget(id)]))).toEqual({
      rpi_pico: 'rpi_pico/rp2040',
      arduino_giga_r1: 'arduino_giga_r1/stm32h747xx/m7',
      esp32s3_devkitc: 'esp32s3_devkitc/esp32s3/procpu',
      stm32f746g_disco: 'stm32f746g_disco/stm32f746xx',
      nucleo_h743zi: 'nucleo_h743zi/stm32h743xx',
      arduino_opta_wifi: 'arduino_opta/stm32h747xx/m7',
    });
    expect(isKnownBoardTarget('missing')).toBe(false);
    expect(isKnownZephyrBoardTarget('arduino_opta/stm32h747xx/m7')).toBe(true);
    expect(isKnownZephyrBoardTarget('arduino_opta')).toBe(false);
  });
});

describe('board compiler memory profiles', () => {
  test('resolves ESP32 limits and leaves host/custom selectors unprofiled', () => {
    expect(getCompilerMemoryProfile('esp32s3_devkitc')).toEqual({
      workSize: 2048,
      retainSize: 1024,
      codeSizeMax: 8192,
    });
    for (const board of ['posix', 'custom', 'missing', undefined]) {
      expect(getCompilerMemoryProfile(board)).toBeUndefined();
    }
  });

  test('keeps every catalogue memory profile positive', () => {
    for (const entry of supportedBoardsManifest as Array<{ ide_id: string }>) {
      const profile = getCompilerMemoryProfile(entry.ide_id);
      expect(profile?.workSize).toBeGreaterThan(0);
      expect(profile?.retainSize).toBeGreaterThan(0);
      expect(profile?.codeSizeMax).toBeGreaterThan(0);
    }
  });
});

describe('network normalization by board', () => {
  test('keeps only Wi-Fi config on Wi-Fi boards', () => {
    const normalized = normalizeNetworkConfigForBoard(
      {
        hostname: 'zplc-cell-a',
        wifi: {
          enabled: true,
          security: 'wpa2-psk',
          ssid: 'PlantWiFi',
          password: 'secret',
          hiddenSsid: false,
          ipv4: { dhcp: true },
        },
        ethernet: {
          enabled: true,
          ipv4: { dhcp: false, ip: '192.168.10.20', gateway: '192.168.10.1' },
        },
      },
      'esp32s3_devkitc'
    );

    expect(normalized?.wifi?.ssid).toBe('PlantWiFi');
    expect(normalized?.ethernet).toBeUndefined();
  });

  test('keeps only Ethernet config on Ethernet boards', () => {
    const normalized = normalizeNetworkConfigForBoard(
      {
        wifi: {
          enabled: true,
          security: 'wpa2-psk',
          ssid: 'ShouldDrop',
          hiddenSsid: false,
          ipv4: { dhcp: true },
        },
      },
      'stm32f746g_disco'
    );

    expect(normalized?.wifi).toBeUndefined();
    expect(normalized?.ethernet?.enabled).toBe(true);
  });

  test('returns undefined for boards without network profile', () => {
    const normalized = normalizeNetworkConfigForBoard(undefined, 'rpi_pico');
    expect(normalized).toBeUndefined();
  });
});
