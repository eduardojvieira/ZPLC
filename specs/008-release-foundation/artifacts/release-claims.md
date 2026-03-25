# Release Claim Inventory

| claim_id | surface | statement | evidence_gate_ids | status |
|----------|---------|-----------|-------------------|--------|
| CLAIM-001 | README | ZPLC v1.5 board claims are limited to the canonical supported-board manifest and linked repo references | REL-001, REL-005 | verified |
| CLAIM-002 | docs | The docs site is the canonical user-facing truth for repo-provable v1.5.0 scope and explicitly labels pending human validation gates | REL-006 | verified |
| CLAIM-003 | ide | The repo declares and automated-tests the ST/IL/LD/FBD/SFC workflow contract; desktop smoke and human debug sign-off remain pending | REL-002 | verified |
| CLAIM-004 | release-notes | Release notes may describe Modbus RTU/TCP and MQTT surfaces only at the repo-visible runtime/compiler/IDE/docs level, not as completed HIL sign-off | REL-003 | verified |
| CLAIM-005 | release-governance | Desktop evidence and release-owner sign-off are still required before any human-owned validation gate can be called complete | REL-004, REL-007 | verified |
