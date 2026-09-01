# ZPLC 2.0 RC3 Physical HIL Checklist

REL-007 is the only human qualification gate. Run this checklist separately for
the selected Raspberry Pi Pico RP2040 and ESP32-S3-DevKitC-1-N8R8 profiles and
record each result with the evidence template.

- [ ] Record the exact release tag/SHA, board revision, probe/runner, transport and wiring.
- [ ] Build runtime firmware from that exact SHA and record the artifact hash/configuration hash.
- [ ] Flash the identified board and confirm the runtime identity/profile and firmware hash.
- [ ] Deploy the verified `.zplc` program through the human-controlled flow and confirm program hash/ABI.
- [ ] Run the golden scenario, capture trace and expected/actual result, then reboot and verify transactional persistence.
- [ ] Verify safe outputs at boot, failed deploy/recovery, watchdog/fault and released-force conditions.
- [ ] Measure and record cycle time, jitter, deadline/overrun behavior against that profile's declared budget.
- [ ] Attach logs, trace, photos or instrument captures and mark each board evidence record pass/fail/blocked.

Final release sign-off follows directly from the two complete HIL records; it is
not a separate technical gate. A failed or blocked record keeps REL-007 pending.
