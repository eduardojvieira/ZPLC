// Renders the body of the draft release that the release workflow creates.
//
//   node packages/zplc-ide/scripts/release-notes.mjs --version 2.0.0-rc.4 > release-notes.md
//
// ponytail: the signing states below are the ones the pipeline is built to produce, written by hand. A body
// generated from what each job ran (REL-027) replaces this table once the outcome checks exist.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIGNING_STATE = [
  ['macOS DMG and ZIP, x64 and ARM64', 'Signed ad hoc and sealed, with the native runtime signed inside the bundle. Not notarized: macOS asks for approval the first time a downloaded copy opens.'],
  ['Windows setup and portable executables, x64 and ARM64', 'Unsigned.'],
  ['Linux AppImage, DEB and RPM, x64 and ARM64', 'Not signed. Integrity comes from the checksums and the build provenance attestation.'],
  ['SPDX SBOM, per-platform checksum and evidence files', 'Not signed. Published so the installers can be verified.'],
];

export function renderReleaseNotes({ version }) {
  return `## Release v${version}

### Repository evidence
- Release artifacts include checksums, an SPDX SBOM, and identity evidence produced by this workflow for the exact release SHA.
- \`ST\`, \`IL\`, \`LD\`, \`FBD\`, and \`SFC\` are described only at the repository-declared and automated-tested workflow level.
- \`firmware/app/boards/supported-boards.v1.5.0.json\` is the current board catalog/evidence baseline, not 2.0 HIL qualification.

### Signing state of every asset

| Asset | Signing state |
| --- | --- |
${SIGNING_STATE.map(([asset, state]) => `| ${asset} | ${state} |`).join('\n')}

### Evidence boundary
Repository and hosted workflow results do not establish HIL, board qualification, timing, safety certification, or human release sign-off.
Prerelease tags remain release candidates, not GA declarations.

### IDE download coverage

- macOS x64 and ARM64: DMG and ZIP.
- Windows x64 and ARM64: Setup and Portable executables.
- Linux x64 and ARM64: AppImage, DEB, and RPM.

Each platform is built and published by its own jobs, so a platform whose jobs failed has no files in this release. Verify the exact attached filenames and their integrity with that platform's checksum and evidence files: \`SHA256SUMS-macos\`, \`SHA256SUMS-windows\` and \`SHA256SUMS-linux\`, and \`release-evidence-macos.json\`, \`release-evidence-windows.json\` and \`release-evidence-linux.json\`.

### Board catalog/evidence baseline

See the canonical manifest and generated docs reference instead of treating this release body as a separate source of truth:

- \`firmware/app/boards/supported-boards.v1.5.0.json\`
- https://eduardojvieira.github.io/ZPLC/reference/boards

### Documentation

- [Full Documentation](https://eduardojvieira.github.io/ZPLC/)
- [Reference Documentation](https://eduardojvieira.github.io/ZPLC/reference)
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, version, ...rest] = process.argv.slice(2);
  if (flag !== '--version' || !version || rest.length > 0) {
    console.error('Usage: release-notes.mjs --version <version>');
    process.exit(2);
  }
  process.stdout.write(renderReleaseNotes({ version }));
}
