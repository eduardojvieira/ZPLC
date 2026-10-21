/**
 * @file firmwareProtocol.ts
 * @brief What protocol a connected firmware speaks, and what Studio says and does about it (COM-029).
 *
 * Firmware older than the device link answers `zplc sys info --json` and nothing else of the link: it speaks the text
 * shell, with `device_protocol_version` 1. Studio does not stop talking to it: it keeps the text shell as the older
 * protocol and as the recovery console, says which things the older protocol cannot do, and says which firmware to
 * install to have them.
 */

import { CAPABILITY } from './protocol.generated';
import type { HelloInfo } from './deviceLink';

export type FirmwareProtocol =
  | { readonly kind: 'framed'; readonly version: number; readonly capabilities: number }
  | { readonly kind: 'shell-only'; readonly shellProtocolVersion: number }
  | { readonly kind: 'unknown' };

/** What the link gives that the text shell does not. */
export interface LinkFeatures {
  /** One writer at a time, released when the session ends (COM-020). */
  readonly sessions: boolean;
  /** A multi-byte write is whole with respect to the scan (COM-023). */
  readonly atomicWrite: boolean;
  /** The device pushes state changes, faults and breakpoints (COM-025). */
  readonly events: boolean;
  /** A download is checked against its CRC-32 and read back (COM-028). */
  readonly checkedDownload: boolean;
}

export interface FirmwareReport {
  readonly protocol: FirmwareProtocol;
  readonly features: LinkFeatures;
  /** What Studio does: use the framed link, or keep the text shell and offer the update. */
  readonly action: 'use-link' | 'use-shell-and-offer-update' | 'cannot-talk';
  /** The version of the firmware, when it said one. */
  readonly firmwareVersion: string | null;
  /** Plain words for the person. */
  readonly message: string;
}

const NO_FEATURES: LinkFeatures = { sessions: false, atomicWrite: false, events: false, checkedDownload: false };

export interface FirmwareObservation {
  /** The version of this Studio. */
  readonly studioVersion: string;
  /** The answer of the framed hello, or null when the firmware did not answer it. */
  readonly hello: HelloInfo | null;
  /** `zplc sys info --json`, read by the strict handshake parser, or null when it could not be read. */
  readonly systemInfo: { readonly zplc_version: string; readonly device_protocol_version: number } | null;
}

const WHAT_IS_MISSING =
  'Sessions (one writer at a time, released when the link is lost), whole multi-byte writes, device events and a ' +
  'downloaded program that is checked and read back are not available: ZPLC writes a multi-byte value one byte at a ' +
  'time, polls the device for its state and trusts the text answer of the shell for a download.';

/** Decide, from what the firmware answered, what it speaks and what Studio does. Deterministic: no clock, no I/O. */
export function describeFirmware(observation: FirmwareObservation): FirmwareReport {
  const { hello, systemInfo, studioVersion } = observation;
  const firmwareVersion = systemInfo?.zplc_version ?? null;
  if (hello !== null) {
    const has = (capability: keyof typeof CAPABILITY) => (hello.capabilities & CAPABILITY[capability]) !== 0;
    return {
      protocol: { kind: 'framed', version: hello.version, capabilities: hello.capabilities },
      features: {
        sessions: has('SESSION'),
        atomicWrite: has('MEMORY'),
        events: has('EVENTS'),
        checkedDownload: has('PROGRAM'),
      },
      action: 'use-link',
      firmwareVersion,
      message:
        `This firmware speaks the framed device link (protocol ${hello.version}).` +
        (firmwareVersion !== null && firmwareVersion !== studioVersion
          ? ` It is version ${firmwareVersion} and this ZPLC is ${studioVersion}.`
          : ''),
    };
  }
  if (systemInfo !== null) {
    const updated =
      `Install the firmware of release ${studioVersion}, the one built from the same source as this ZPLC, ` +
      'and connect again. The text shell of this firmware keeps working until then.';
    return {
      protocol: { kind: 'shell-only', shellProtocolVersion: systemInfo.device_protocol_version },
      features: NO_FEATURES,
      action: 'use-shell-and-offer-update',
      firmwareVersion,
      message:
        `This firmware (version ${systemInfo.zplc_version}) speaks only the older text shell ` + `protocol. ${WHAT_IS_MISSING} ${updated}`,
    };
  }
  return {
    protocol: { kind: 'unknown' },
    features: NO_FEATURES,
    action: 'cannot-talk',
    firmwareVersion: null,
    message:
      'The device answered neither the framed device link nor `zplc sys info`. It is not a ZPLC runtime, or its firmware ' +
      'is older than the text shell this ZPLC reads. Check the port and install firmware of release ' +
      `${studioVersion}.`,
  };
}
