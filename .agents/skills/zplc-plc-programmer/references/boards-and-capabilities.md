# Boards and capability evidence

The only canonical board catalogue is
`firmware/app/boards/supported-boards.v1.5.0.json`; IDE selection consumes it
through `packages/zplc-ide/src/config/boardProfiles.ts`. It contains six
profiles, all marked `cross-build`, each with an empty `evidence_refs` list.
That is build evidence only, not device, HIL, persistence, network, timing, or
production qualification.

`specs/008-release-foundation/contracts/supported-board-manifest.md` permits
only `cross-build` or `human-hil` validation levels. Use the exact board ID,
Zephyr target, variant, and support assets recorded by the manifest. Do not infer a
capability from a marketing board name or an overlay alone.

If a human asks for `firmware-build`, use the CLI contract in
`packages/zplc-ide/src/cli/index.ts`: it is a local, ephemeral cross-build.
It does not flash, deploy a PLC program, start a runtime, or qualify hardware.
