# Human-Only Validation Checklist for v1.5.0

This checklist extracts the work that the current `specs/008-release-foundation/spec.md`
assigns to a human owner. AI can prepare automation, docs, and fixes, but these items
require direct human execution or sign-off.

## Human-Required Validation

- [ ] Run desktop smoke validation on real `macOS`
- [ ] Run desktop smoke validation on real `Linux`
- [ ] Run desktop smoke validation on real `Windows`
- [ ] Verify install/launch, project open, compile, simulation, deployment, and debugging on each desktop platform
- [ ] Manually verify breakpoints, step/continue, watch table, visual inspection, and force-value workflows
- [ ] Flash and validate at least one serial-focused board in hardware-in-the-loop conditions
- [ ] Flash and validate at least one network-capable board in hardware-in-the-loop conditions
- [ ] Capture a standard evidence record for every `Human` release gate
- [ ] Rerun the human side of every `Shared` gate after AI-assisted fixes
- [ ] Approve the final supported-board claim set
- [ ] Approve final release sign-off based on observed evidence

## Evidence Record Minimum Fields

- [ ] Owner
- [ ] Date
- [ ] Environment
- [ ] Steps run
- [ ] Result
- [ ] Supporting artifacts

## Notes

- A gate marked `Human` cannot be closed by automation alone.
- A gate marked `Shared` is not complete until the human rerun is recorded.
- If a behavior cannot be verified by a human in the real target environment, it must be
  removed from the `v1.5.0` supported claim set or marked experimental.
