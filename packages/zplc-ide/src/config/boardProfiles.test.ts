import { describe, expect, test } from 'bun:test';
import supportedBoardsManifest from '../../../../firmware/app/boards/supported-boards.v1.5.0.json';

import {
  BOARD_OPTIONS,
  getBoardNetworkType,
  normalizeNetworkConfigForBoard,
} from './boardProfiles';

describe('board network profile mapping', () => {
  test('maps manifest-declared network boards correctly', () => {
    expect(getBoardNetworkType('esp32s3_devkitc')).toBe('wifi');
    expect(getBoardNetworkType('arduino_giga_r1')).toBe('wifi');
    expect(getBoardNetworkType('stm32f746g_disco')).toBe('ethernet');
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
