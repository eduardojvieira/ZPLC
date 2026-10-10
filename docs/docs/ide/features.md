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

For each project, Studio also remembers the open tabs, the active tab, the cursor and scroll position of each file, and the size of the editor and lower panels (and whether the lower panel was collapsed). It puts them back the next time that folder is opened, from **Recent** or with **Open project**. Only paths and positions are stored in the session: unsaved text is kept separately and offered back only after a crash (see Recovering unsaved work), and a tab whose file no longer exists is dropped without a message. The list and the sessions are kept in Studio's private user-data directory, never in the project folder, and the session of a project that leaves the list is deleted the next time Studio starts.

Evidence level: host. The unit tests of requirement IDE-008 (`packages/zplc-ide/electron/recentProjects.test.ts`, `sessionStore.test.ts`, `packages/zplc-ide/src/utils/sessionState.test.ts` and `packages/zplc-ide/src/store/sessionPersistence.test.ts`) cover the list and the session format, and journey 12 (restore the session) and journey 14 (a recent project that is gone) of `bun run test:journeys` drive the real application on a display.

## Preferences

Preferences belong to you, not to a project: they apply to every project and are kept for your user account, so they survive a restart. Open them from the **Preferences** disclosure of the Welcome screen, or at the top of the Project Settings tab inside a project.

| Preference | Choices | Default |
|---|---|---|
| Theme | Light, Dark, High contrast | System |
| Editor font size | 10 to 32 px | 14 px |
| Tab size | 2, 3, 4 or 8 spaces | 4; a file's own indentation does not override it |
| Density | Comfortable, Compact | Comfortable; compact scales the spacing of the whole window |
| Language | English, Español | Español, as the Learn lessons have always begun; it sets the Learn lessons today and the rest of the interface is English |
| Autosave | Off, or after 5, 15, 30 or 60 seconds without typing | Off |
| Check for a newer release when Studio starts | On or off, and a **Check now** button | Off |

Autosave writes the modified files with the same save as **Save all**, without a line in Output for each save; a file that cannot be written stays modified and is reported. Together with the recovery copies, a crash costs at most the typing of the last second.

The update check asks the GitHub releases of this project for the latest published release and says whether it is newer than the running build. It sends nothing about you, downloads nothing and installs nothing; the answer is a version and a link. It never runs until you turn it on or press **Check now**.

Evidence level: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `src/store/useAppSettings.test.ts`, `src/store/autosave.test.ts`, `electron/updateCheck.test.ts` and `electron/updateCheckIpc.test.ts` cover the settings, autosave and the update check (requirements IDE-007 and IDE-010), and journey 21 (preferences apply and persist per user) of `bun run test:journeys` changes them in the real application and restarts it.

## Files and folders in the project tree

The Explorer header has **New File** and **New Folder**. A right click on a file or a folder (or F2 for a rename) opens its actions:

| Action | What it does |
|---|---|
| **Rename** | Renames the file or folder on disk. Its open tab, its unsaved text and its breakpoints follow it, and a task that runs a renamed program is updated in `zplc.json` (when the project settings have no unsaved edits). |
| **Duplicate** | Copies a file next to the original as `Name_copy.ext` (or `_copy2`, and so on), from the text the editor shows. |
| **Move to...** | Moves a file or a folder into another folder of the project. A program moved out of `src` is reported: the build reads only the files directly in `src`. |
| **Delete** / **Delete folder** | Removes it from disk after a confirmation that names any file in it with unsaved changes. |
| **New folder...** | On a folder: makes a folder inside it. |

Studio refuses a name that is taken, or that the build reads as the same as another program (case differences, `main.ld` and `main.ld.json`, the same name in another folder), and says so in the dialog without changing anything. An empty folder is shown in the tree.

A change made outside Studio is picked up while a project is open. A file without unsaved changes reloads by itself, and one that was deleted closes; a file with unsaved changes asks **Keep my version** or **Load from disk** (for a deleted file, **Keep my version** or **Close file**) and nothing is overwritten before you answer. A save made by Studio is never taken for an outside change. New and removed files appear in the tree. Changes to `zplc.json` made outside Studio are not watched yet.

Evidence level: host. `packages/zplc-ide/src/project/treeOperations.test.ts`, `src/store/useIDEStore.test.ts` (project tree operations, over the real project service on a temporary folder), `src/store/externalChanges.test.ts`, `electron/projectWatcher.test.ts` and `electron/projectFiles.test.ts` cover the rules, and journeys 23 (project tree operations) and 24 (changes made outside Studio) of `bun run test:journeys` drive the real application.

## Closing with unsaved changes

Studio never drops a modified file without asking. Closing a modified tab, closing the project, closing the window and quitting the application each ask to save, discard or cancel; **Cancel** (and Escape) keep everything as it was, and a save that fails keeps the file open and modified. Closing the project offers **Save all and close**, **Discard changes and close** and **Continue editing**. Reload shortcuts (Ctrl+R, Ctrl+Shift+R, Cmd+R) are absent from a packaged build: the menu has no reload entry and the keys are swallowed. A development host reloads only through the same question.

Evidence level: host. Journey 10 (close with unsaved changes: tab and window) and journey 22 (Close Project asks before it closes) of `bun run test:journeys` drive the real application; `packages/zplc-ide/electron/appMenu.test.ts` and `closeGuardIpc.test.ts` pin the menu and the reload chords. The reload chord itself cannot be injected into the main process through the DevTools protocol that the journeys use, so the reload prompt is covered by unit tests and by reading the registered handler, not by a journey.

## Recovering unsaved work

Studio keeps a copy of every modified file in its private user-data directory a second after you stop typing (and at least every few seconds while you keep typing). Saving a file, discarding it, closing it with **Discard**, or closing the project or the window and answering **Save** or **Discard** removes the copy, so a normal exit leaves nothing behind.

If Studio was killed or crashed, open the project again: a **Recover unsaved changes** dialog lists each file that had modified text, with its name and the time the copy was kept. **Restore** puts the text back in the editor, still unsaved; **Discard** removes the copy. Closing the dialog decides nothing, and the copies are offered again the next time. A copy that equals the file on disk, or whose file is gone, is removed without asking. Copies of projects that leave the Recent list are deleted when Studio starts.

Limits: a project keeps copies of at most 64 files and about 64 MB of text. Changes to the project settings (`zplc.json`) are not copied yet.

Evidence level: host. The unit tests of requirement IDE-006 (`packages/zplc-ide/electron/recoveryStore.test.ts`, `recoveryStoreIpc.test.ts`, `packages/zplc-ide/src/store/recoveryPersistence.test.ts`, `src/utils/recoveryOffer.test.ts` and `src/ipc/recoveryBridge.test.ts`) cover the store, the messages and the timing, and journey 19 (recover modified files after a crash) of `bun run test:journeys` kills the real application process with SIGKILL, starts it again and restores the file.

## A failure stays in its region

If the editor, the lower panel or the toolbar throws an exception while it draws, that region shows what stopped and a **Retry** button, and the rest of the window keeps working, so you can still save your files. **Retry** draws only that region again. If the failure is outside every region, the whole window shows the same message with **Retry** and a way to close the project; the window is never left blank.

Evidence level: host. Journey 20 (a failing region does not blank the window) of `bun run test:journeys` makes each of the three regions fail in the real application, checks that the other two keep working and that Retry brings the failed one back; `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` covers the region logic.

## Notifications

The result of a build, a save, a deploy, a connection change and a test run appears
at the bottom right of the window as a notification. Each one says what happened and
has **Details**, which opens the panel that holds the evidence: **Output** for a
save, a successful build, a deploy and a connection, **Problems** for a failed
build, **Tests** for a test run. A long operation (a build, a run of scenarios, a
deploy, a connection) shows a progress bar while it runs, and a build and a test run
also show **Cancel**: a cancelled build keeps no artifact, and a cancelled run
stops its native runtime.

A success goes by itself after a few seconds. A failure, a warning (for example a
device that received an earlier build) and a cancellation stay until you dismiss
them. The notification is a summary: every message that Studio wrote to the Output
panel before is still there.

Evidence level: host. `packages/zplc-ide/src/store/notifications.test.ts` covers the
model (progress, the cancel action, how long each result stays, the bound on the
list) and `src/components/NotificationsList.test.tsx` the drawing; journey 27 of
`bun run test:journeys` saves, builds, connects, runs and cancels a long test run
and breaks the build in the real application, and follows **Details** of each
notification to its panel (requirement IDE-021). A deploy notification needs a
device and is not covered by a journey.

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
