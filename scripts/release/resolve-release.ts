// What a run of the release workflow may do (REL-030, REL-031), decided here and not in shell inside the workflow.
//
//   EVENT_NAME=workflow_dispatch EVENT_REF=refs/heads/x REF_NAME=x REQUESTED_VERSION=2.0.0-rc.4 REHEARSAL=true \
//     bun scripts/release/resolve-release.ts      writes version=, tag= and publishing= to $GITHUB_OUTPUT
//
// A rehearsal runs the whole pipeline and publishes nothing: no draft, no upload, no attestation. Only the push of a
// version tag, or a manual run that unticks the rehearsal input on that exact tag, publishes, and then only a draft.
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ReleaseEvent {
  eventName: string;
  /** github.ref: `refs/tags/v2.0.0-rc.4`, `refs/heads/main`. */
  ref: string;
  /** github.ref_name: `v2.0.0-rc.4`, `main`. */
  refName: string;
  /** The `version` input of a manual run. */
  requestedVersion: string;
  /** The `rehearsal` input of a manual run. */
  rehearsal: boolean;
  /** The version of the root package.json: the one source of the product version. */
  canonicalVersion: string;
}

export interface ReleaseIdentity {
  version: string;
  tag: string;
  publishing: boolean;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
/** The last tagged release candidate of 2.0.0 when REL-031 was written: later candidates continue from it. */
const LAST_TAGGED_RC = { base: '2.0.0', number: 3 };

/** A prerelease is `rc.<n>`: any other word would sort below `rc.3` under semantic versioning. */
function checkSequence(version: string): void {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`Release version ${version} is not a semantic version`);
  const label = match[4];
  if (label === undefined) return;
  const candidate = /^rc\.(0|[1-9]\d*)$/.exec(label);
  if (!candidate)
    throw new Error(
      `Prerelease ${version} must be rc.<n>: an alpha, beta or preview name sorts below rc.3, so tags continue the rc sequence`,
    );
  const base = `${match[1]}.${match[2]}.${match[3]}`;
  if (base === LAST_TAGGED_RC.base && Number(candidate[1]) < LAST_TAGGED_RC.number) {
    throw new Error(
      `Release candidate ${version} comes after ${LAST_TAGGED_RC.base}-rc.${LAST_TAGGED_RC.number}: the sequence continues, it does not ` +
        `go back`,
    );
  }
}

export function resolveRelease(event: ReleaseEvent): ReleaseIdentity {
  const manual = event.eventName === 'workflow_dispatch';
  const requested = manual ? event.requestedVersion : event.refName.replace(/^v/, '');
  if (requested !== event.canonicalVersion) {
    throw new Error(`Requested release version ${requested} does not match canonical package.json version ${event.canonicalVersion}`);
  }
  checkSequence(event.canonicalVersion);
  const tag = `v${event.canonicalVersion}`;
  const publishing = manual ? !event.rehearsal : true;
  if (manual && publishing && event.ref !== `refs/tags/${tag}`) {
    throw new Error(`Select the exact release tag refs/tags/${tag} before publishing a release; a rehearsal can run from any ref.`);
  }
  if (!manual && event.ref !== `refs/tags/${tag}`) {
    throw new Error(
      `The ref ${event.ref} is not the tag ${tag} that this version of package.json is released as: tag ${event.refName} does not match.`,
    );
  }
  return { version: event.canonicalVersion, tag, publishing };
}

function main(): number {
  const env = process.env;
  const root = resolve(import.meta.dir, '..', '..');
  const canonicalVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
  try {
    const identity = resolveRelease({
      eventName: env.EVENT_NAME ?? '',
      ref: env.EVENT_REF ?? '',
      refName: env.REF_NAME ?? '',
      requestedVersion: env.REQUESTED_VERSION ?? '',
      rehearsal: env.REHEARSAL !== 'false',
      canonicalVersion,
    });
    // a prerelease is named for how complete it is (REL-031): the statement is part of the title of the release
    if (identity.version.includes('-')) {
      const status = JSON.parse(readFileSync(join(root, 'scripts/release/release-status.json'), 'utf8')) as {
        versions: Record<string, { completeness?: string }>;
      };
      if ((status.versions[identity.version]?.completeness ?? '').trim() === '') {
        throw new Error(
          `scripts/release/release-status.json has no completeness ` +
            `for ${identity.version}: the title of a prerelease says how complete it is`,
        );
      }
    }
    const lines = `version=${identity.version}\ntag=${identity.tag}\npublishing=${identity.publishing}\n`;
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, lines);
    else process.stdout.write(lines);
    console.error(`release: ${identity.tag}, ${identity.publishing ? 'publishes a draft' : 'rehearsal: publishes nothing'}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.main) process.exitCode = main();
