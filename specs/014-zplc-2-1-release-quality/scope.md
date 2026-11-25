# Spec 014: scope of 2.1.0

This is the one list of what 2.1.0 holds and what is left (FRZ-001). It replaces every other ledger as the answer to "what is left".
Each change that closes or adds an item updates this list in the same change (FRZ-004); nothing new enters the scope after 2026-11-25 (S-21).

| Item | Spec | State | Blocked by |
|---|---|---|---|
| Catalogue C0-C7: frame, conveyors, flow, sensors, operator and stations, manipulators, stations, tank, items; fixes after the first look (machining centre inset, crane rail, tank glass, state cues) | 012 VIS-014, VIS-016; plan-vis C0, C1, C2, C3, C4, C5, C6, C7 | done (02387d03, 903cb4a5, d76326df) | none |
| C8 catalogue sheet and the 21 scenes in their initial view | 012 VIS-014, VIS-017; plan-vis C8 | done (f52e73fa, c94cef7a) | none |
| C8 owner's look at the catalogue sheet (STOP 3) | 012 VIS-014; plan-vis C8 | waiting | owner: look at the catalogue sheet (STOP 3) |
| Sensor kinds drawn differently | 012 VIS-014, PRT-006 | waiting | owner: decision on a kind field in the core (not possible in the view alone) |
| E1, E2, E3 and the thread A verifier (STOP 4) | 012 VIS-012, VIS-016, VIS-018; plan-vis E1, E2, E3 | not started | owner: approval of stop 3 |
| U2 complete | 013 FND-001..007 | done (59f645de, bfb01f36) | none |
| U3 X1a, X1b-1 (view table, Guide place) | 013 FND-002, SHL-002, SHL-005; plan-u3 X1a, X1b | done (f72e7386, 42466ba7) | none |
| U3 X1b-2 (Plant activity on the rail) | 013 SHL-002, SHL-005, PLS-005; plan-u3 X1b | done (5b216fab) | none |
| U3 G1-G6, P1-P8, D1, D2, Q1 and the verifier (STOP: usable Guide) | 013 GDE-001..012, PLS-001, PLS-004, PLS-008, PLS-009, PLS-010; plan-u3 G1, P1, D1, Q1 | in progress | G1a merged (411e1e5d); G1b running |
| U3 G7 first-use sessions | 013 GDE-013; plan-u3 G7 | not started | owner: runs the G7 sessions |
| Course step 2 pilot (STOP), done on feat/course-step2 075ee7bc | 012 CRS-001..008 | waiting | owner: approval of step 2; owner: statement on the T4, T5, T8 2.1.x proposal |
| Course steps 3-4, lesson images with the new plant look, four scenarios strengthened | 012 CRS-003, CRS-005, CRS-012 | not started | owner: approval of step 2 |
| Runtime batching (answer 6) | 012 LNK-003, LNK-015 | done (17efa73c) | none |
| MCP preview (answer 7), AI-01, AI-02 | 014 AIX-001 | done (a36e1d9e) | none |
| Grade keeps numeric failures (schema stays 4) | 012 SCN-004, SCN-005 | done (fc419393, d449e779) | none |
| N10 scenes 7, 10, 11, 16 grade exact counts | 012 SCN-005 | done (5b35cd65) | none |
| M5-Q6 soak | 012 PLT-008; plan-m5 Q6 | done (9ee38ed8) | none |
| M5-Q6 journeys: station fault and emergency stop by keyboard, crane readout | 012 VIS-010; plan-m5 Q6 | done (6dbe44c0) | none |
| Stacker crane pose size | 012 VIS-014 | done (78558053) | none |
| Spec 012 coverage, SCN-003 open (89/93 with the next row) | 012 SCN-003 | waiting | owner or reviewer: originality review |
| Spec 012 coverage, CRS-009, LNK-016, LNK-017 | 012 CRS-009, LNK-016, LNK-017 | waiting | HIL bench |
| M6-V7 evidence run, local seam | 012 LNK-014, LNK-015; plan-m6 V7 | not started | quiet machine |
| HIL BENCH-2.1 on ESP32-S3 and Pico; gate 6 records before publishing (bench sheet and tmux session script ready) | 012 LNK-007, LNK-016, LNK-017; plan-m6 E1 | waiting | owner: at the bench, types the commands |
| Hosted CI ci.yml, green on f0bccfdc; rerun 45652874318 on 14dbc5fb | none | in progress | the rerun |
| Nightly on hosted runners (answer 10): 21 scene hashes equal to Linux on win32 and darwin (45636849073) | 012 SCN-004 | done (49e94ade) | none |
| Windows: native simulator saves a program twice (fix/hal-win-rename) | none | in progress | nightly rerun to prove it |
| Windows and macOS test portability: tmpdir realpath, paths, CRLF, mode bits, Linux-only tools, loopback, browser teardown | none | in progress | group B running; groups C-J queued |
| Spec 014 requirement index and coverage report | 014 FRZ-001..004 | done (536c79db, 5c7c5e6c) | none |
| Spec 014 AI-22: cite AGENTS.md rule 8 for physical operations | 014 OSS-005 | done (14dbc5fb) | none |
| Spec 014 FRZ-001 scope list and its check | 014 FRZ-001 | in progress | this change |
| Spec 014 JRN-001 journeys.md | 014 JRN-001 | not started | writer slots |
| Spec 014 AIX, UXV and PUB threads | 014 AIX-001..015, UXV-001..009, PUB-001..005 | not started | writer slots; their own stops |
| Version 2.1.0, T20-K5 compiler known issues | none | not started | the cut |
| CHANGELOG Unreleased, screenshots, rehearsal | none | not started | the cut |
| PR, tag, publication | none | not started | owner: PR, tag and publication; green seam |
