---
slug: /ide/features
id: features
title: Studio Workbench
sidebar_label: Workbench
description: The ZPLC Studio 2.0 editor, bottom panel, simulation, and test workflow.
tags: [ide, user-guide]
---

# Studio Workbench

The workbench keeps editing central and puts Explorer, Inspector, Output,
Problems, Tests, Lab, Learn, Changes, Agent, Trace, Watch, and Terminal in one
bottom panel.

## Daily workflow

1. Work in a user-selected project folder.
2. Compile and resolve diagnostics.
3. Run a temporal test or native POSIX scenario and inspect its trace.
4. Review the evidence source before drawing a conclusion.

## Recent projects and session restore

The Welcome screen lists, under **Recent**, up to ten folders that you opened before, most recent first, each with its name and when it was last opened. Choosing one reopens it without a folder dialog. A folder that was moved, deleted or replaced by a link is shown as not found, with a **Forget** button that removes it from the list. Only a folder that you chose through the system folder dialog is ever remembered.

For each project, Studio also remembers the open tabs, the active tab, the cursor and scroll position of each file, and the size of the editor and lower panels (and whether the lower panel was collapsed). It puts them back the next time that folder is opened, from **Recent** or with **Open project**. Only paths and positions are stored: unsaved edits are not restored, and a tab whose file no longer exists is dropped without a message. The list and the sessions are kept in Studio's private user-data directory, never in the project folder, and the session of a project that leaves the list is deleted the next time Studio starts.

Evidence level: host. The unit tests of requirement IDE-008 (`packages/zplc-ide/electron/recentProjects.test.ts`, `sessionStore.test.ts`, `packages/zplc-ide/src/utils/sessionState.test.ts` and `packages/zplc-ide/src/store/sessionPersistence.test.ts`) cover the list and the session format, and journey 12 (restore the session) and journey 14 (a recent project that is gone) of `bun run test:journeys` drive the real application on a display.

## Recovering unsaved work

Studio keeps a copy of every modified file in its private user-data directory a second after you stop typing (and at least every few seconds while you keep typing). Saving a file, discarding it, closing it with **Discard**, or closing the project or the window and answering **Save** or **Discard** removes the copy, so a normal exit leaves nothing behind.

If Studio was killed or crashed, open the project again: a **Recover unsaved changes** dialog lists each file that had modified text, with its name and the time the copy was kept. **Restore** puts the text back in the editor, still unsaved; **Discard** removes the copy. Closing the dialog decides nothing, and the copies are offered again the next time. A copy that equals the file on disk, or whose file is gone, is removed without asking. Copies of projects that leave the Recent list are deleted when Studio starts.

Limits: a project keeps copies of at most 64 files and about 64 MB of text. Changes to the project settings (`zplc.json`) are not copied yet.

Evidence level: host. The unit tests of requirement IDE-006 (`packages/zplc-ide/electron/recoveryStore.test.ts`, `recoveryStoreIpc.test.ts`, `packages/zplc-ide/src/store/recoveryPersistence.test.ts`, `src/utils/recoveryOffer.test.ts` and `src/ipc/recoveryBridge.test.ts`) cover the store, the messages and the timing, and journey 19 (recover modified files after a crash) of `bun run test:journeys` kills the real application process with SIGKILL, starts it again and restores the file.

## A failure stays in its region

If the editor, the lower panel or the toolbar throws an exception while it draws, that region shows what stopped and a **Retry** button, and the rest of the window keeps working, so you can still save your files. **Retry** draws only that region again. If the failure is outside every region, the whole window shows the same message with **Retry** and a way to close the project; the window is never left blank.

Evidence level: host. Journey 20 (a failing region does not blank the window) of `bun run test:journeys` makes each of the three regions fail in the real application, checks that the other two keep working and that Retry brings the failed one back; `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` covers the region logic.

## Editors

ST is the primary language-service path. LD, FBD, and SFC open, edit, save,
copy, and undo their semantic models; their generated ST is an artifact, not a
round-trip source. IL remains a compatibility surface where its compiler path
accepts it.

## Simulation and hardware

Native POSIX simulation is the way to run a program on your computer. It needs
the desktop app, which includes the native runtime; a browser WebAssembly
simulator is not available in this release. Hardware actions are separate:
build runtime firmware, flash runtime firmware, deploy a compiled program, then
run/debug. A person starts each of them.

## Learn

Learn is a tab of the bottom panel. The **Learn** action on the Welcome screen copies the first lesson into a folder that you choose and opens that tab. This is what it offers today:

- Ten lessons, in Spanish and in English (the toggle is in the panel, and Spanish is the default). Each lesson comes with its own example project: a source file in Structured Text and a scenario file.
- Every lesson goes through the stages Objective, Predict, Edit, Run, Observe and Reflect, and the expected checkpoint of each stage stays hidden until you ask for it.
- You edit the copied project and run only the scenario of that lesson from **Tests**. The panel grades the recorded run: a lesson counts as completed when its scenario passed with all its assertions saved. Studio remembers the completed lessons, and **Export progress** and **Import progress** move them as a small file.
- All the lessons are unlocked and can be taken in any order. Learn never starts a physical operation: it only copies a project and opens **Tests**.
- A result is host evidence from the native simulation, not hardware evidence.

A course with levels, prerequisites and a fixed order, a lesson surface that stays beside the editor, and a track for a learner board are future work (the LRN requirements). Nothing on this page promises them.

Evidence level: host. `packages/zplc-ide/src/components/learnLesson.test.ts` and `LearnPanel.test.ts` cover the lessons and the grading, and `packages/zplc-ide/src/learn/starterGrading.test.ts` runs every starter against its scenario.

## Debugging boundary

Watches, traces, breakpoints, and forces show only what the connected adapter
can report. A host trace is not hardware/HIL evidence; a force or RUN/STOP
action on a physical system requires explicit human authority and a site safety
procedure. AI and MCP tools cannot force values or change RUN/STOP; see
[AI and privacy](./ai-privacy.md).

## Pause, resume, step and Stop

Pause, resume and step keep the logical state of the program where it is, and Stop discards it. The table holds for the native simulation and for the Zephyr scheduler of a connected board.

| Action | Output image | Forces | The scan |
|---|---|---|---|
| Pause | Kept | Kept | Pauses between scans. |
| Step | Kept, and shows the stepped scan | Kept | Runs one whole scan, or finishes the scan stopped at a breakpoint. |
| Resume | Kept | Kept | A scan stopped at a breakpoint continues from there. |
| Stop | Zeroed | Cleared | Every task is back at its entry point, and a scan that a breakpoint interrupted is discarded. |

A fault clears the image and the forces as Stop does. On a board, Pause, Step and Stop also drive the physical outputs to their safe state, off. [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop) has the full table and the Zephyr tests behind it, run on `native_sim` and QEMU with no board measured. For the native simulation the checks are in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, where Stop also zeroes the input image.
