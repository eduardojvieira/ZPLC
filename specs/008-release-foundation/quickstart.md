# Quickstart: Executing the v1.5.0 Release Foundation Plan

This quickstart describes the recommended maintainer flow for validating the `v1.5.0`
release foundation work.

## 1. Prepare the Workspace

```bash
bun install
```

Ensure Zephyr/west, desktop build prerequisites, and any required HIL hardware are
available before running the full matrix.

## 2. Rebuild Truth Sources

1. Audit tracked generated output, temporary artifacts, and placeholder specs.
2. Regenerate any derived assets from canonical sources only.
3. Reconcile supported-board claims into the single supported-board manifest.
4. Reconcile docs navigation into the canonical docs manifest.

## 3. Run Automated Validation

```bash
just release-validate
```

Or run the validation groups directly:

### Runtime / Core

```bash
just test-core
```

Or run the underlying host validation directly from the runtime area:

```bash
ctest --test-dir firmware/lib/zplc_core/build --output-on-failure
```

### Compiler / IDE

```bash
bun test
bun x tsc --noEmit
```

### Documentation

```bash
python3 tools/hil/validate_docs_parity.py
bun --cwd docs run build
```

### Cross-build Matrix

Run west builds for every board still present in the supported-board manifest.

### Release Evidence

```bash
python3 tools/hil/validate_release_evidence.py
python3 tools/hil/validate_supported_boards.py
python3 tools/hil/audit_repo_hygiene.py
python3 tools/hil/audit_specs_scope.py
```

## 4. Run Human Validation

1. Build/install the desktop IDE on macOS, Linux, and Windows.
2. Execute the smoke checklist: open project, compile, simulate, deploy, debug,
   breakpoint, step, watch, force value.
3. Run HIL validation on at least one serial-focused board and one network-capable board.
4. Capture a standard evidence record for every `Human` and `Shared` gate.

## 4.1 AI vs Human Ownership Rules

- `AI` gates may be prepared and closed by automated evidence.
- `Human` gates require a person to execute the validation and save an evidence record.
- `Shared` gates require automated proof first and a human rerun after any AI-assisted fix.
- If a human rerun does not happen, the gate stays open and the claim must not ship as
  supported.

## 5. Final Release Decision

The release is ready to advance only when:

- every release-blocking gate in the evidence matrix is `passed` or explicitly `rescoped`;
- every human-owned gate has a complete evidence record; and
- README, docs, IDE, and release notes all reflect the same verified claim set.

## 6. Recommended AI-Only Completion Boundary

Before handing off to human validation, the repository should already satisfy all of the
following:

- release truth-source validators pass
- compiler and IDE automated tests pass
- docs parity validator and docs build pass
- release notes and README match the current verified claim set
