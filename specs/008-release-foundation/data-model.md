# Data Model: ZPLC v1.5.0 Release Foundation

**Feature**: 008-release-foundation  
**Date**: 2026-03-13

---

## 1. Core Entities

### ReleaseEvidenceMatrix

The release-level table used to decide whether `v1.5.0` is real.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `gate_id` | string | Yes | Stable unique identifier for a release gate |
| `gate_name` | string | Yes | Human-readable gate name |
| `claim_scope` | string | Yes | Capability or release claim being validated |
| `owner_type` | enum(`AI`,`Human`,`Shared`) | Yes | Ownership model for the gate |
| `owner` | string | Yes | Named owner or role |
| `verification_method` | string | Yes | Primary validation method |
| `required_evidence` | string[] | Yes | Evidence artifacts needed before pass |
| `status` | enum(`pending`,`blocked`,`passed`,`failed`,`rescoped`) | Yes | Current gate state |
| `last_verified_sha` | string | No | Commit SHA used for the latest verification |
| `last_verified_at` | datetime | No | Timestamp of latest verification |
| `artifact_links` | string[] | No | Links/paths to logs, screenshots, reports, or records |
| `notes` | string | No | Scope reduction, blocker, or follow-up summary |

**Validation rules**:

- `owner_type = Human` requires at least one linked `EvidenceRecord`.
- `owner_type = Shared` requires both automated evidence and a linked human rerun record.
- `status = passed` requires all `required_evidence` present.

---

### EvidenceRecord

The standard record attached to a human-owned or shared validation gate.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `record_id` | string | Yes | Unique evidence identifier |
| `gate_id` | string | Yes | Foreign key to `ReleaseEvidenceMatrix.gate_id` |
| `owner` | string | Yes | Human owner who executed or confirmed the validation |
| `date` | date | Yes | Execution date |
| `environment` | string | Yes | OS/hardware/network/environment description |
| `steps_run` | string[] | Yes | Exact executed validation steps |
| `result` | enum(`pass`,`fail`,`blocked`) | Yes | Validation outcome |
| `supporting_artifacts` | string[] | Yes | Logs, screenshots, binaries, or trace references |
| `expected_vs_actual` | string | No | Outcome comparison |
| `commit_or_tag` | string | No | Verified revision |
| `issues_found` | string[] | No | Problems discovered during validation |
| `rerun_required` | boolean | Yes | Whether another validation pass is mandatory |

**Board-specific extension fields**:

- `ide_board_id`
- `zephyr_board`
- `hardware_used`
- `build_command`

---

### SupportedBoardEntry

The canonical board record that drives firmware, IDE, docs, and release notes.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `board_id` | string | Yes | Stable canonical identifier |
| `display_name` | string | Yes | User-facing name |
| `ide_id` | string | Yes | IDE selector identifier |
| `zephyr_board` | string | Yes | Zephyr board target string |
| `variant` | string | No | CPU/core/variant identifier |
| `support_assets` | string[] | Yes | Overlay/conf paths proving maintained support |
| `build_command` | string | Yes | Canonical cross-build command |
| `network_class` | enum(`serial-focused`,`network-capable`,`other`) | Yes | Determines HIL coverage grouping |
| `validation_level` | enum(`cross-build`,`human-hil`) | Yes | Highest validation level achieved |
| `evidence_refs` | string[] | No | Links to matrix/evidence records |
| `docs_ref` | string | Yes | Canonical docs page or anchor |

**Validation rules**:

- A supported board must have at least one maintained support asset path.
- Every supported board must pass cross-build validation.
- At least one `serial-focused` and one `network-capable` board must reach
  `validation_level = human-hil`.

---

### SupportedLanguagePath

The full authoring-to-runtime route for a claimed IEC language.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `language` | enum(`ST`,`IL`,`LD`,`FBD`,`SFC`) | Yes | Claimed language |
| `editor_mode` | enum(`text`,`visual`,`hybrid`) | Yes | User authoring mode in IDE |
| `normalization_path` | string | Yes | Direct compile path or transpilation path |
| `compile_output` | string | Yes | Output artifact type |
| `simulation_supported` | boolean | Yes | Whether simulation is release-supported |
| `deployment_supported` | boolean | Yes | Whether deployment is release-supported |
| `debug_supported` | boolean | Yes | Whether debugging is release-supported |
| `evidence_refs` | string[] | No | Validation references for the language path |
| `limitations` | string[] | No | Explicitly documented limitations |

**Validation rules**:

- Every claimed language must have `simulation_supported = true`,
  `deployment_supported = true`, and `debug_supported = true` for v1.5.0.
- Any limitation must be reflected in docs and release claims.

---

### ProtocolFeatureContract

The combined runtime/compiler/IDE/documentation definition of one protocol feature.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `feature_id` | string | Yes | Unique protocol feature identifier |
| `protocol` | enum(`modbus-tcp`,`modbus-rtu`,`mqtt`) | Yes | Protocol family |
| `function_block` | string | Yes | IEC-facing block name |
| `supported_languages` | string[] | Yes | Language paths where the feature is supported |
| `runtime_semantics` | string | Yes | Expected scan-cycle/status behavior |
| `ide_configuration_inputs` | string[] | Yes | User-facing config inputs |
| `host_validation` | string[] | Yes | Automated host checks |
| `hil_validation` | string[] | Yes | Hardware-backed validation checks |
| `docs_refs` | string[] | Yes | Canonical docs pages |

---

### CanonicalDocsPage

One release-blocking documentation page in the canonical docs manifest.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | string | Yes | Canonical docs slug |
| `english_path` | string | Yes | English source path |
| `spanish_path` | string | Yes | Spanish source path |
| `area` | string | Yes | Product area (runtime, IDE, docs, etc.) |
| `release_blocking` | boolean | Yes | Whether parity is required for release |
| `owner` | string | Yes | Responsible maintainer/role |
| `status` | enum(`missing`,`draft`,`review`,`ready`) | Yes | Page completion state |

---

### ReleaseClaim

One capability statement that may appear in README, docs, IDE UI, or release notes.

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `claim_id` | string | Yes | Unique identifier |
| `surface` | enum(`README`,`docs`,`ide`,`release-notes`) | Yes | Publication surface |
| `statement` | string | Yes | Exact claim text |
| `evidence_gate_ids` | string[] | Yes | Gates that must pass before publication |
| `status` | enum(`draft`,`verified`,`experimental`,`removed`) | Yes | Claim truth status |

**Lifecycle rule**:

- If any linked evidence gate fails or is rescoped, the claim must become `experimental`
  or `removed` before release.
