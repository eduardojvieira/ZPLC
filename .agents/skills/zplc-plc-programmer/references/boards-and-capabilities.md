# Boards and capability evidence

The only board catalogue is `firmware/app/boards/boards.json`; Studio selects a board
through `packages/zplc-ide/src/config/boardProfiles.ts`, which reads it. Each entry has
the Zephyr target, the build command, the support assets and an I/O description of the
channels of the board.

The support level of a board is derived from the evidence records the entry references
(`evidence_refs`), by `firmware/zephyr/scripts/zplc_boards.py`; it is never a field to set.
It is `cross-build` or `human-hil`. A board with no passing record that names the
firmware version, the commit and the image hash is `cross-build`, which is build
evidence only: not device, HIL, persistence, network, timing or production qualification.
The levels and the table of boards are on `docs/docs/reference/capabilities-evidence.md`,
generated from the manifest.

Use the exact board ID, Zephyr target and variant that the manifest records. Do not
infer a capability from a board name or an overlay alone.

If a human asks for `firmware-build`, use the CLI contract in
`packages/zplc-ide/src/cli/index.ts`: it is a local, ephemeral cross-build. It does not
flash, deploy a PLC program, start a runtime or qualify hardware.
