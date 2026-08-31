# Changelog

All notable changes are documented here.

## Unreleased

## 2.0.0-rc.1 - 2026-08-31

- Hardened program loader, persistence, scheduler, and transport trust boundaries.
- Added canonical compiler, project, and Tool API contracts, plus supervised native
  simulation and the redesigned Studio workbench.
- Added restricted AI/MCP, Lab, and Learn foundations, and reproducible packaging
  and release-evidence plumbing.
- **Breaking C API:** `zplc_core_load_raw` and `zplc_mem_load_code` are no
  longer exported. Product artifact-admission routes must use verified
  `zplc_core_load` or `zplc_core_load_tasks`; `zplc_vm_*` remains a low-level
  trusted-embedder API, and its embedder owns verification before supplying or
  modifying code.

This RC is not GA and does not establish HIL, board qualification, or safety
certification. Hosted workflow evidence and human sign-off remain required.
