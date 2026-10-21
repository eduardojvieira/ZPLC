/**
 * Does a debug map belong to a program? (CMP-056)
 *
 * SPDX-License-Identifier: MIT
 *
 * The build identity is written once into the artifact, in its BUILD segment, and once into the debug map of
 * the same build. A tool that shows variables, lines or breakpoints of a program that runs asks here before it
 * trusts the map.
 */

import { readArtifact } from '../assembler/index.ts';
import type { DebugMap } from './debug-map.ts';

/** The answer of {@link debugMapMatchesArtifact}. */
export type BuildIdVerdict =
    | { ok: true; buildId: string }
    | {
          ok: false;
          reason: 'map-has-no-identity' | 'artifact-has-no-identity' | 'different-build';
          mapId?: string;
          artifactId?: string;
          message: string;
      };

/**
 * Whether `map` was written by the build that produced `artifact` (the bytes of a `.zplc` file, or the
 * bytes the device holds).
 */
export function debugMapMatchesArtifact(map: DebugMap, artifact: Uint8Array): BuildIdVerdict {
    const found = readArtifact(artifact).buildId;
    const artifactId = found === undefined ? undefined : found.toString(16).padStart(8, '0');
    const mapId = map.buildId?.toLowerCase();
    if (mapId === undefined) {
        return {
            ok: false,
            reason: 'map-has-no-identity',
            artifactId,
            message:
                'The debug map carries no build identity: it was written by a build that predates it, so it cannot be tied to this program',
        };
    }
    if (artifactId === undefined) {
        return {
            ok: false,
            reason: 'artifact-has-no-identity',
            mapId,
            message: 'The program carries no build identity, so the debug map cannot be tied to it',
        };
    }
    if (mapId !== artifactId) {
        return {
            ok: false,
            reason: 'different-build',
            mapId,
            artifactId,
            message:
                `The debug map belongs to build ${mapId} and the program is build ${artifactId}: rebuild and download, or open the ` +
                `map of this program`,
        };
    }
    return { ok: true, buildId: artifactId };
}
