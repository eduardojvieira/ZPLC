/**
 * @file support.ts
 * @brief Whether a board can be fed from the plant, and the located reason when it cannot (LNK-012, LRN-011).
 */

import { CAPABILITY } from '../../runtime/link/protocol.generated';
import type { FirmwareProtocol } from '../../runtime/link/firmwareProtocol';
import { plantBoardEn, plantBoardEs } from '../../i18n/catalog/plantBoard';

export interface PlantIoReason {
  readonly en: string;
  readonly es: string;
}

export type PlantIoSupport = { readonly supported: true } | { readonly supported: false; readonly reason: PlantIoReason };

const FIRMWARE: PlantIoReason = { en: plantBoardEn['plantIo.unsupported.firmware'], es: plantBoardEs['plantIo.unsupported.firmware'] };
const NO_CAPABILITY: PlantIoReason = {
  en: plantBoardEn['plantIo.unsupported.reason.noCapability'],
  es: plantBoardEs['plantIo.unsupported.reason.noCapability'],
};

/** `info` is what the firmware said about itself; no description (null) reads as a firmware that cannot be fed. */
export function plantIoSupport(info: FirmwareProtocol | null | undefined): PlantIoSupport {
  if (info?.kind === 'framed')
    return (info.capabilities & CAPABILITY.PLANT) !== 0 ? { supported: true } : { supported: false, reason: NO_CAPABILITY };
  return { supported: false, reason: FIRMWARE };
}
