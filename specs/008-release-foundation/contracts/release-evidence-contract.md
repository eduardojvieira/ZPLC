# Contract: Release Evidence Matrix and Evidence Records

This contract defines the minimum structure required to sign off `v1.5.0` release gates.

## 1. Release Evidence Matrix

The release evidence matrix is the single release-level table of all gates.

### Required Columns

| Column | Description |
|--------|-------------|
| `gate_id` | Stable unique gate identifier |
| `gate_name` | Human-readable gate title |
| `claim_scope` | Capability or release claim covered by the gate |
| `owner_type` | `AI`, `Human`, or `Shared` |
| `owner` | Named owner or role |
| `verification_method` | Primary validation path |
| `required_evidence` | List of evidence artifacts required for pass |
| `status` | `pending`, `blocked`, `passed`, `failed`, or `rescoped` |
| `last_verified_sha` | Git SHA used for verification |
| `last_verified_at` | Verification timestamp |
| `artifact_links` | Links/paths to evidence artifacts |
| `notes` | Blocker, scope reduction, or follow-up notes |

### Matrix Rules

1. Every release-facing capability MUST map to at least one gate.
2. A gate with `owner_type = Human` MUST have a linked evidence record before it can pass.
3. A gate with `owner_type = Shared` MUST include both automated evidence and a linked
   human rerun record.
4. A gate marked `rescoped` MUST trigger claim reduction in release notes and docs.

## 2. Evidence Record

Each human-owned or shared gate MUST have at least one evidence record.

### Required Fields

| Field | Description |
|-------|-------------|
| `record_id` | Unique record identifier |
| `gate_id` | Linked release gate |
| `owner` | Human who executed or confirmed the validation |
| `date` | Validation date |
| `environment` | OS, hardware, network, board, and relevant setup |
| `steps_run` | Exact executed steps |
| `result` | `pass`, `fail`, or `blocked` |
| `supporting_artifacts` | Logs, screenshots, traces, or binaries |
| `expected_vs_actual` | Comparison of expected and actual outcome |
| `commit_or_tag` | Verified revision |
| `rerun_required` | Whether another run is mandatory |

### Board Validation Extension

Board-related evidence records SHOULD also include:

- `ide_board_id`
- `zephyr_board`
- `hardware_used`
- `build_command`

## 3. Acceptance Rule

`v1.5.0` sign-off is blocked unless:

- every release-blocking gate is `passed` or explicitly `rescoped`;
- every human-owned gate has a completed evidence record; and
- every shared gate shows both automated proof and human rerun proof.
