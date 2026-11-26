# Spec 014: scope of 2.1.0

This is the one list of what 2.1.0 holds and what is left (FRZ-001). It replaces every other ledger as the answer to "what is left".
Each change that closes or adds an item updates this list in the same change (FRZ-004); nothing new enters the scope after 2026-11-25 (S-21), except what the owner adds by statement (S-23, D-37).

| Item | Spec | State | Blocked by |
|---|---|---|---|
| Catalogue C0-C7: frame, conveyors, flow, sensors, operator and stations, manipulators, stations, tank, items; fixes after the first look (machining centre inset, crane rail, tank glass, state cues) | 012 VIS-014, VIS-016; plan-vis C0, C1, C2, C3, C4, C5, C6, C7 | done (02387d03, 903cb4a5, d76326df) | none |
| C8 catalogue sheet and the 21 scenes in their initial view | 012 VIS-014, VIS-017; plan-vis C8 | done (f52e73fa, c94cef7a) | none |
| C8 owner's look at the catalogue sheet (STOP 3): approved in part on 2026-11-25 (belts, sensors, controls, tank, items) | 012 VIS-014; plan-vis C8 | done (f619a1c1) | none |
| C9 closed wave S3-01 to S3-11: asymmetric position marks and input lamps (turntable, grippers, potentiometer, scale, limit switch); machining centre, stacker crane, pick-place, gantry and remover to the conveyors' level; loose blocks of the stop blade and aligner; first views of the warehouse and three-level-lifts; one camera per part on the sheet | 012 VIS-014, VIS-016; plan-vis C8 | in progress | C9-1 merged (09cac70f), C9-2 merged (0adb1e58); C9-3 in progress (feat/plant-c9-flow-views); owner: look at the new sheet in .cache/claude-ux-review/plant/c9/ |
| Sensor kinds drawn differently: a kind field in the core catalogue, outside the trace (owner decision 4a) | 012 VIS-014, PRT-006 | done (beebff58, 82db0a0b; merged 271f11c8; every pair >= 0.31% of the sheet cell as a regression floor, owner 2026-11-26) | owner: the c10 sheet with the five kinds and a two-kind scene view (VIS-014) |
| E1, E2, E3 and the thread A verifier (STOP 4) | 012 VIS-012, VIS-016, VIS-018; plan-vis E1, E2, E3 | not started | E2: none (may run beside C9); E1 and E3: C9 |
| U2 complete | 013 FND-001..007 | done (59f645de, bfb01f36) | none |
| U3 X1a, X1b-1 (view table, Guide place) | 013 FND-002, SHL-002, SHL-005; plan-u3 X1a, X1b | done (f72e7386, 42466ba7) | none |
| U3 X1b-2 (Plant activity on the rail) | 013 SHL-002, SHL-005, PLS-005; plan-u3 X1b | done (5b216fab) | none |
| U3 G1-G6, P1-P8, D1, D2, Q1 and the verifier (STOP: usable Guide) | 013 GDE-001..012, PLS-001, PLS-004, PLS-008, PLS-009, PLS-010; plan-u3 G1, P1, D1, Q1 | in progress | G1 done and verified (0f47e67a), G5a done (f619a1c1), G5b in progress; G2-G4, G6, P1-P8, D1, D2, Q1 not started |
| U3 G7 first-use sessions (protocol and record sheet ready, 57b4d50d) | 013 GDE-013; plan-u3 G7 | waiting | owner: runs the G7 sessions |
| Course step 2 pilot: approved by the owner on 2026-11-25 as the standard for every module; T4, T5, T8 stay in 2.1.0 | 012 CRS-001..008 | done (420ff8ed) | none |
| Course steps 3-4: CP-01 (<=4-col signal tables), CP-02 (>=12 px machine labels) and pilot CP-04/CP-05 done (80a313e9); next T1 didactics, modules 0-4 and the ST path with CP-03 to CP-05 and decision-5 glossary terms; lesson images after C9; four scenarios strengthened | 012 CRS-003, CRS-005, CRS-012 | in progress | T1, modules 0-4, ST path, scenarios; machine images wait for C9 |
| Runtime batching (answer 6) | 012 LNK-003, LNK-015 | done (17efa73c) | none |
| MCP preview (answer 7), AI-01, AI-02 | 014 AIX-001 | done (a36e1d9e) | none |
| Grade keeps numeric failures (schema stays 4) | 012 SCN-004, SCN-005 | done (fc419393, d449e779) | none |
| N10 scenes 7, 10, 11, 16 grade exact counts | 012 SCN-005 | done (5b35cd65) | none |
| M5-Q6 soak | 012 PLT-008; plan-m5 Q6 | done (9ee38ed8) | none |
| M5-Q6 journeys: station fault and emergency stop by keyboard, crane readout | 012 VIS-010; plan-m5 Q6 | done (6dbe44c0) | none |
| Stacker crane pose size | 012 VIS-014 | done (78558053) | none |
| Spec 012 coverage, SCN-003 open (89/93 with the next row) | 012 SCN-003 | waiting | spec 014 reviewer: originality review of the repo-only list; owner signs |
| Spec 012 coverage, CRS-009, LNK-016, LNK-017 | 012 CRS-009, LNK-016, LNK-017 | waiting | HIL bench |
| M6-V7 evidence run, local seam | 012 LNK-014, LNK-015; plan-m6 V7 | waiting | owner: announces the quiet window |
| HIL BENCH-2.1 on ESP32-S3 and Pico; gate 6 records before publishing (bench sheet and tmux session script ready) | 012 LNK-007, LNK-016, LNK-017; plan-m6 E1 | waiting | owner: at the bench, types the commands |
| Hosted CI ci.yml: green on f0bccfdc; fb73c77f red (shard 3 store leak, journey 47 save race), both fixed (27f00284, 2b1c6dfd); 45674898020 on 2b1c6dfd failed on journeys 47 and 63, both fixed (projectSources immediate structural indexing + journey 63 board section); rerun dispatched on head | none | in progress | the rerun on head |
| Nightly on hosted runners (answer 10): 21 scene hashes equal to Linux on win32 and darwin (45636849073) | 012 SCN-004 | done (49e94ade) | none |
| Windows: native simulator saves a program twice; fix proven on Windows runner (nightly 45664343548, 0 occurrences of commit failed); no 2.0.2, ships in 2.1.0 only (L433) | none | done (b13cf917) | none |
| Windows and macOS test portability: groups B, C, D, E, G, H, I, J and the macOS FBD selection merged; F (file modes) by an icacls ACL assertion measured on the Windows runner first | none | in progress | nightly rerun; the F measurement |
| Spec 014 requirement index and coverage report | 014 FRZ-001..004 | done (536c79db, 5c7c5e6c) | none |
| Spec 014 AI-22: cite AGENTS.md rule 8 for physical operations | 014 OSS-005 | done (14dbc5fb) | none |
| Spec 014 FRZ-001 scope list and its check | 014 FRZ-001 | done (80624007) | none |
| Spec 014 JRN-001 journeys.md | 014 JRN-001 | done (07968804) | none |
| Spec 014 AIX, UXV and PUB threads: AIX defects AI-10, AI-16, D-35 (07647370, 1842e22f, verified) and AI-14 (efcf9502, verified 2026-11-26) done; the AIX plan corrected and merged (plan-aix.md, owner stop; W1-W6 approved (W3-W6 on 2026-11-26, with the AI-4 notice added to AIX-U7; the §2.1a sentences approved)), UXV and PUB not started | 014 AIX-001..015, UXV-001..009, PUB-001..005 | in progress | the AIX plan is an owner stop |
| Version 2.1.0, T20-K5 compiler known issues | none | not started | the cut |
| CHANGELOG Unreleased, screenshots, rehearsal | none | not started | the cut |
| PR, tag, publication | none | not started | owner: PR, tag and publication; green seam |
| Every compiler function placed in FBD and Ladder (S-23, D-37): one mechanism from the compiler's table, the conversions group, the generated tests, the docs; plan-lng.md, units U-LNG-1 to U-LNG-4 | 014 LNG-029, LNG-030 | not started | the independent verifier reads plan-lng.md before any unit starts |
| Pre-existing defect, class compile error (never a wrong value; probe 2026-11-26): a 64-bit typed literal (LWORD#, ULINT#, LINT#) as the IN of SHL, SHR, ROL or ROR is refused at compile with STACK_DEPTH_EXCEEDED; assignment and arithmetic with the same literals compile and give the right value | none | not started | none |
| Pre-existing limit, class refused with a named error: Ladder refuses an initial value on a BYTE, WORD, DWORD or LWORD variable | none | not started | none |
| Pre-existing defect, class display: the Ladder MUX box labels its extra inputs from the fixed pin list (a 4-operand MUX shows IN4 for IN2); fixed within LNG-030 (owner 2026-11-26) | 014 LNG-030 | in progress | U-LNG-2 correction |
