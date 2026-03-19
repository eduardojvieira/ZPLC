# Contract: Supported Board Manifest

This contract defines the canonical supported-board list for `v1.5.0`.

## Purpose

Firmware, IDE, docs, and release notes MUST consume one shared supported-board manifest.
If a board is absent from the manifest, it is absent from release claims.

## Required Fields Per Board Entry

| Field | Description |
|-------|-------------|
| `board_id` | Stable canonical identifier |
| `display_name` | User-facing board name |
| `ide_id` | IDE selector identifier |
| `zephyr_board` | Canonical Zephyr target string |
| `variant` | CPU/core variant if needed |
| `support_assets` | Maintained overlay/conf paths |
| `build_command` | Canonical cross-build command |
| `network_class` | `serial-focused`, `network-capable`, or `other` |
| `validation_level` | `cross-build` or `human-hil` |
| `evidence_refs` | Linked release evidence records |
| `docs_ref` | Canonical docs reference |

## Contract Rules

1. Every manifest entry MUST map to real maintained support assets in `firmware/app/boards/`.
2. Every manifest entry MUST pass cross-build validation.
3. At least one `serial-focused` and one `network-capable` manifest entry MUST have
   `validation_level = human-hil`.
4. IDE selectors, docs tables, README links, and release notes MUST derive supported-board
   claims from this manifest.
5. Boards without maintained support assets or release evidence MUST be removed from the
   manifest before release sign-off.
