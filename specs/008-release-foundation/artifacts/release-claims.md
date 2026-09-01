# ZPLC 2.0 RC3 Release Claim Inventory

| claim_id | surface | statement | evidence_gate_ids | status |
|----------|---------|-----------|-------------------|--------|
| CLAIM-001 | README and docs | ZPLC 2.0 RC3 non-HIL controls are implemented and locally verifiable through repository checks; board and timing claims remain evidence-gated. | REL-001, REL-002, REL-006 | verified |
| CLAIM-002 | Studio, AI and MCP | Studio, Tool API, AI and MCP operate under restricted, testable local policies; no physical operation is delegated to AI or MCP. | REL-002, REL-003 | verified |
| CLAIM-003 | Lab and Learn | Lab replay and Learn grading use the shared host runtime/test evidence and remain separate from hardware qualification. | REL-004 | verified |
| CLAIM-004 | Release workflow | The exact-SHA hosted workflow is configured to create checksums, SBOM, provenance and validate native macOS/Windows signing when publishing; those artifacts remain execution evidence until that workflow runs. Linux payloads are reproducibly checked, checksummed and attested rather than called natively signed. | REL-005 | verified |
| CLAIM-005 | Hardware and safety | ZPLC 2.0 RC3 is not a safety PLC, production-qualified board release, or HIL result until REL-007 contains the traceable physical evidence. | REL-007 | verified |
