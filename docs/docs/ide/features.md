---
slug: /ide/features
id: features
title: ZPLC Workbench
sidebar_label: Workbench
description: The ZPLC window, projects, preferences, simulation controls, watching and debugging.
tags: [ide, user-guide]
---

# ZPLC workbench

The workbench is the window you work in. This page shows where everything is, how to manage a project and its files, how to run and watch a program, and what the application keeps for you between sessions. Editing itself is on [Text and visual editors](./editors.md).

An activity rail and a primary sidebar on the left hold the project navigator, search, the tests and the lessons. An optional secondary sidebar on the right holds the Inspector. A results panel under the editor holds Output, Problems, Tests, Interlocks, Lab, Changes, Agent, Trace, Watch and Terminal.

## Daily workflow

1. Work in a project folder you chose.
2. Build the project and resolve the diagnostics.
3. Run a scenario test or the native simulation, and read its trace.
4. Check which evidence a result is before you draw a conclusion from it.

## Layout, navigator and configuration editors

From the top, the window has the application menu, the command bar (build, connect and run controls, the project name and the command palette button), then side by side the **activity rail**, the **primary sidebar**, the **editor area** over the **results panel**, and the **secondary sidebar**, and last the status bar.

- **Activity rail.** Project, Search, Tests and Learn. Choosing one swaps the primary sidebar; the chosen one is marked by a bar at its edge and a filled button, not by colour alone. Tests also shows the results panel.
- **Primary sidebar.** Project shows the navigator, Search finds text in the project, Tests explains the scenarios and opens the results, and Learn holds the lessons.
- **Secondary sidebar.** The Inspector. It starts hidden so that the editor keeps its width; show or hide it with the Inspector button of the command bar or **View > Show or hide the secondary sidebar**.
- **Results panel.** Hide it with **View > Show or hide the results panel**.

The primary sidebar is `Ctrl+Alt+B`, the secondary sidebar `Ctrl+Alt+I` and the results panel `Ctrl+Alt+J` (⌘⌥ on macOS). **Show the project navigator** is `Ctrl+Shift+E` and **Search in the project** is `Ctrl+Shift+F`. Which sidebars are shown and which activity is selected are kept between sessions.

### Navigator by PLC objects

A toggle in the header of the navigator chooses between two modes, and the choice is remembered.

- **Objects** (the default) groups the project as **Programs**, **Function blocks**, **Functions**, **Data types**, **Global variables**, **Tasks**, **I/O mapping**, **Communication** and **Device**. The first five come from the compiler's reading of the Structured Text files, and for Programs also from the diagram and instruction list files; a file that declares several objects is listed under each kind. The others come from `zplc.json`. Choosing an object opens its file at its line, or its configuration editor.
- **Files** is the file tree, with the Declarations section and the library folders.

### Configuration editors

**Tasks**, **I/O mapping**, **Network**, **Communication** and **Target** each open as a tab of the editor area, from the navigator or from the list in the Settings tab. All the tabs edit one document, `zplc.json`: **Save configuration** writes it, and closing the last tab that shows it with unsaved edits asks whether to save, discard or keep editing. The Settings tab keeps the project metadata and the application preferences.

### Search

Search looks for text in the Structured Text and instruction list files of the project, including unsaved changes, with or without matching case, and lists the matches by file. Choosing a match opens the file at that line. It does not search diagrams, which are stored as models.

### Moving the separators

Each separator between two regions lights up under the pointer, fills while you drag it and shows the focus ring when it has the keyboard focus. With the focus on a separator, the arrow keys move it by 5 points, Shift with an arrow by 15, Home and End take it to its limits, and Enter collapses or restores the panel next to it. A double click restores the default size. The sizes of the sidebars are kept between sessions, and the split of the editor and the results panel is kept for each project.

### Window sizes

The main path (open a project, edit, build, simulate, watch) fits a window of 1366 by 768 pixels with no clipped control. The window can be as small as 1024 by 768: below 1100 pixels wide the rail shows icons only, the secondary sidebar hides itself, and the theme, settings and shortcut commands move into the **More commands** menu of the command bar.

Evidence level: host. Unit tests of requirements UX-011, UX-012, UX-013 and UX-017 (`packages/zplc-ide/src/layout/separatorSteps.test.ts`, `packages/zplc-ide/src/store/useShellLayout.test.ts`) and a journey of `bun run test:journeys` cover them on the development host. No packaged, macOS or Windows window was measured.

## Create and open projects

**New project**, on the Welcome screen and in the File menu, asks for four things: the project name, the folder it goes in, the target (the simulation on this computer, or a board of the manifest) and the language of the first program. The name starts as the name of the folder you choose, until you type another. The folder holds the project itself: ZPLC creates no folder inside it, and refuses a folder that already holds a `zplc.json`, a `.gitignore` or the first program. The new project has `src/main` in the chosen language, a global variable list, a main task that runs that program and the chosen target, and it builds without a change.

The Welcome screen also offers **Open project**, **Learn** and the bundled examples, grouped by topic and, inside a topic with several levels, by level (Beginner, Intermediate, Advanced). A project that cannot be opened is reported on the screen, next to the action, never in a system message box.

Evidence level: host. `packages/zplc-ide/src/project/newProject.test.ts` builds the first program of every language and checks the task that runs it, and journey 2b drives the dialog in the real application.

## Recent projects and session restore

Under **Recent**, the Welcome screen lists up to ten folders you opened before, most recent first, each with its name and when it was last opened. Choosing one reopens it without a folder dialog. A folder that was moved, deleted or replaced by a link is shown as not found, with a **Forget** button. Only a folder you chose through the system folder dialog is ever remembered.

For each project, ZPLC also remembers the open tabs, the active tab, the cursor and scroll position of each file, and the size of the editor and lower panels, and puts them back the next time the folder opens. Only paths and positions are stored in the session; unsaved text is kept separately and offered back only after a crash. A tab whose file no longer exists is dropped without a message. The list and the sessions live in ZPLC's private user-data directory, never in the project folder, and the session of a project that leaves the list is deleted the next time ZPLC starts.

Evidence level: host. `packages/zplc-ide/electron/recentProjects.test.ts` and `packages/zplc-ide/src/utils/sessionState.test.ts` cover the list and the session format (IDE-008), and journeys 12 and 14 of `bun run test:journeys` drive the real application.

## Files and folders in the project tree

In the Files mode of the navigator, the header has **New File** and **New Folder**. A right click on a file or a folder, or `F2` for a rename, opens its actions:

| Action | What it does |
| --- | --- |
| **Rename** | Renames the file or folder on disk. Its open tab, unsaved text and breakpoints follow it, and a task that runs a renamed program is updated in `zplc.json` when the project settings have no unsaved edits. |
| **Duplicate** | Copies a file next to the original as `Name_copy.ext` (then `_copy2`, and so on), from the text the editor shows. |
| **Move to...** | Moves a file or a folder into another folder of the project. A program moved out of `src` is reported: the build reads only the files directly in `src`. |
| **Delete** / **Delete folder** | Removes it from disk after a confirmation that names any file in it with unsaved changes. |
| **New folder...** | On a folder: makes a folder inside it. |

ZPLC refuses a name that is taken, or that the build reads as the same as another program (case differences, `main.ld` and `main.ld.json`, the same name in another folder), and says so in the dialog without changing anything.

A change made outside ZPLC is picked up while a project is open. A file without unsaved changes reloads by itself, and one that was deleted closes. A file with unsaved changes asks **Keep my version** or **Load from disk** (for a deleted file, **Keep my version** or **Close file**), and nothing is overwritten before you answer. A save made by ZPLC is never taken for an outside change. Changes to `zplc.json` made outside ZPLC are not watched yet.

Evidence level: host. `packages/zplc-ide/src/project/treeOperations.test.ts` and `packages/zplc-ide/electron/projectWatcher.test.ts` cover the rules, and journeys 23 and 24 of `bun run test:journeys` drive the real application.

## Declarations and library folders

Under the file tree, the Files mode has a **Declarations** section, closed until you open it. Its heading shows how many declarations there are and how many files are not compiled. It lists the programs, function blocks, functions, interfaces and data types that the Structured Text files declare, grouped under their file, and choosing one opens its file with the cursor on its name.

The build reads the Structured Text files directly in `src` and directly in each **library folder** that `zplc.json` lists under `libraries` (CMP-046), and everything they declare is visible to every program:

```json
{ "libraries": ["lib", "vendor/acme"] }
```

A library is a relative path of plain names with `/`, inside the project and listed once; `src` and `tests` are not libraries. **Library folder...** in the Declarations section adds one and writes `zplc.json`, its **x** takes it away, and the file tree marks the folder `library`. The declarations of a library appear in the Declarations list, in the **Project** group of the Function Block Diagram and Ladder palettes, and in the completion and hover of the Structured Text editor.

A Structured Text file that is neither in `src` nor directly in a library folder is read by no build. ZPLC says so as the build does: the file is marked `not compiled` in the tree, the section lists its folder with a **List as library** button, and **Build** reports `SOURCE_NOT_COMPILED`. A folder inside a library is not read either; list it as a library of its own. A library folder that is renamed or deleted stays in the list, marked "not in the project", until you remove it. A project that waits for its version 1 migration cannot change its libraries until the migration is applied.

Evidence level: host. `packages/zplc-ide/src/project/libraries.test.ts` and `packages/zplc-ide/src/project/unlistedSources.test.ts` cover the rules, and journey 32 of `bun run test:journeys` lists a library in the real application and builds the project with it.

## Project archives

**Export Project Archive** (in the Build options menu) writes the open project to one zip file that you choose in the system save dialog. **Import a project archive** (on the Welcome screen) reads one back into an equivalent project:

1. Choosing the archive reads it and writes nothing. A dialog says what it holds (files, folders and size), whose project it is and, for a version 1 project, the lines that migrating it changes in `zplc.json`.
2. **Choose a folder and import** asks for an empty folder, writes the files there byte for byte and opens the project. A folder that is not empty is refused, and an import that fails leaves the folder empty again.

The archive holds the files as they are on disk, so ZPLC asks you to save modified files first. It leaves out what the project tree hides (`node_modules`, `.git`, `build`, `dist` and `.vscode`) and links. An archive made on one machine is the same bytes as one made on another: entries sorted by path, stored without compression, dated 1980-01-01, names in UTF-8. ZPLC reads archives that other tools wrote, stored or deflated, and refuses one that holds an absolute path, a `..`, a name two systems read differently, a link, an encrypted entry, two files that differ only by case, a file that does not match its checksum, more than 4096 files, a file over 16 MiB or more than 64 MiB in all. **Export Project**, next to it, writes the JSON document of the files and the configuration without its secrets; that document does not import.

Evidence level: host. `packages/zplc-ide/electron/projectArchiveZip.test.ts` covers the format, the refusals and a round trip on real folders, and journey 30 of `bun run test:journeys` exports and imports a project in the real application.

## Closing with unsaved changes

ZPLC never drops a modified file without asking. Closing a modified tab, closing the project, closing the window and quitting each ask to save, discard or cancel; **Cancel** and Escape keep everything as it was, and a save that fails keeps the file open and modified. Closing the project offers **Save all and close**, **Discard changes and close** and **Continue editing**. The reload shortcuts (`Ctrl+R`, `Ctrl+Shift+R`, `Cmd+R`) are absent from a packaged build.

## Recovering unsaved work

ZPLC keeps a copy of every modified file in its private user-data directory a second after you stop typing, and at least every few seconds while you keep typing. Saving a file, discarding it, or closing the project or the window and answering **Save** or **Discard** removes the copy, so a normal exit leaves nothing behind.

If ZPLC was killed or crashed, open the project again. A **Recover unsaved changes** dialog lists each file that had modified text, with the time the copy was kept. **Restore** puts the text back in the editor, still unsaved; **Discard** removes the copy. Closing the dialog decides nothing, and the copies are offered again next time. A copy that equals the file on disk, or whose file is gone, is removed without asking.

Limits: a project keeps copies of at most 64 files and about 64 MB of text, and changes to the project settings (`zplc.json`) are not copied yet.

Evidence level: host. `packages/zplc-ide/electron/recoveryStore.test.ts` covers the store, the messages and the timing (IDE-006), and journey 19 of `bun run test:journeys` kills the real application with SIGKILL, starts it again and restores the file.

## Preferences

Preferences belong to you, not to a project: they apply to every project and are kept for your user account. Open them from the **Preferences** disclosure of the Welcome screen, or at the top of the Project Settings tab inside a project.

| Preference | Choices | Default |
| --- | --- | --- |
| Theme | Light, Dark, High contrast | System |
| Editor font size | 10 to 32 px | 14 px |
| Tab size | 2, 3, 4 or 8 spaces | 4; a file's own indentation does not override it |
| Density | Comfortable, Compact | Comfortable; compact scales the spacing of the whole window |
| Language | Automatic, English, Español | Automatic: it follows the language of the operating system (see [Interface language](#interface-language)) |
| Autosave | Off, or after 5, 15, 30 or 60 seconds without typing | Off |
| Check for a newer release when ZPLC starts | On or off, and a **Check now** button | Off |

Autosave writes the modified files with the same save as **Save all**, without a line in Output for each save. A file that cannot be written stays modified and is reported. Together with the recovery copies, a crash costs at most the typing of the last second.

The update check asks the GitHub releases of this project for the latest published release and says whether it is newer than the running build. It sends nothing about you, downloads nothing and installs nothing; the answer is a version and a link. It never runs until you turn it on or press **Check now**.

Evidence level: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `packages/zplc-ide/src/store/autosave.test.ts` and `packages/zplc-ide/electron/updateCheck.test.ts` cover the settings, autosave and the update check (IDE-007, IDE-010), and journey 21 of `bun run test:journeys` changes them in the real application and restarts it.

## Interface language

The **Language** preference chooses the language of ZPLC: **Automatic**, **English** or **Español**. Automatic, the default, follows the language of the operating system (`es`, `es-AR` and `es-MX` give Spanish; every other language gives English). The choice applies at once, without a restart, and also sets the language of the Learn lessons. The Spanish text is neutral Latin American Spanish with impersonal or "usted" forms, as in an industrial manual.

The language and the theme are also kept in a small file in ZPLC's private user-data directory, so the next start already has the right menu language and window colour. A missing or damaged file falls back to English and the system theme.

Evidence level: host. `packages/zplc-ide/src/i18n/i18n.test.tsx` and `packages/zplc-ide/electron/shellPreferences.test.ts` cover the catalogs, the setting and the stored preferences (UX-029, UX-031).

## Application menu, command palette and shortcuts

ZPLC keeps one list of commands, and every way to start a command reads it: the application menu, the command palette, the keyboard shortcuts, the hints in the tooltips and the shortcut reference. A command therefore does the same thing wherever you start it.

- **Application menu.** File, Edit, View, Project, Build, Online, Debug and Help, on Windows, Linux and macOS alike. The menu is in the language of the **Language** preference. A packaged build has no reload or developer-tools item. The View menu keeps page zoom: Zoom in, Zoom out and Actual size, on `Ctrl` and plus, minus and 0 (`Cmd` on macOS).
- **Command palette.** Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS), type a few letters of a command, choose with the arrow keys and press Enter. The palette lists every command, so each one is reachable from the keyboard even when it has no shortcut. A command that does not apply now, such as Deploy without a connection, is listed as not available and does not run.
- **Shortcut reference.** Open **Help** > **Keyboard shortcuts**, or press `Ctrl+K` and then `Ctrl+S`, to see every command with its shortcut.

| Shortcut | Command |
| --- | --- |
| `Ctrl+S` | Save |
| `Ctrl+B` | Compile the project |
| `F5` | Run, or resume when paused |
| `Shift+F5` | Stop |
| `F6` | Pause |
| `F10` | Step one cycle |
| `F8` | Reset the runtime |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+K`, then `Ctrl+S` | Keyboard shortcuts |

`Cmd` replaces `Ctrl` on macOS. The shortcuts that act on a program (`F5`, `F6`, `F10`, `F8`, `Shift+F5`) leave a text field its own keys.

**Commands that act on a device.** Connect, Disconnect, Deploy, Run, Pause, Stop, Step and Reset run the same action as the toolbar button of the same name, with the same checks and the same confirmation: Deploy still asks before it sends a program. They are controls for the person at the keyboard. The MCP tools and the optional AI provider have no access to them, and cannot flash, deploy, force, run or stop anything.

Evidence level: host. `packages/zplc-ide/src/commands/commands.test.ts` and `packages/zplc-ide/electron/appMenu.test.ts` (UX-014, UX-015) check that no two commands share a shortcut, that every menu item and palette entry is a registered command, that every command has a title in both languages, and the shape of the menu on Windows, Linux and macOS with a stand-in for the platform. The native menu has not been run on Windows or macOS.

## Simulation and hardware

The native simulation is the way to run a program on your computer. It needs the desktop application, which includes the native runtime. Where the native runtime cannot start, the simulation runs on the WebAssembly runtime; the status bar says so and lists what it does not have (no communication blocks, no serial, no pins, the timing of the application window). See [Software runtime](../runtime/browser-runtime.md).

Hardware actions are separate: build the runtime firmware, flash it, deploy a compiled program, then run and debug. A person starts each of them. See [Deploy a program](./deployment.md).

## Pause, resume, step and Stop

Pause, resume and step keep the logical state of the program where it is, and Stop discards it. The table holds for the native simulation and for the Zephyr scheduler of a connected board.

| Action | Output image | Forces | The scan |
| --- | --- | --- | --- |
| Pause | Kept | Kept | Pauses between scans. |
| Step | Kept, and shows the stepped scan | Kept | Runs one whole scan, or finishes the scan stopped at a breakpoint. |
| Resume | Kept | Kept | A scan stopped at a breakpoint continues from there. |
| Stop | Zeroed | Cleared | Every task is back at its entry point, and a scan that a breakpoint interrupted is discarded. |

A fault clears the image and the forces as Stop does. On a board, Pause, Step and Stop also drive the physical outputs to their safe state, off. [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop) has the full table and the Zephyr tests behind it, run on `native_sim` and QEMU with no board measured. For the native simulation the checks are in `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, where Stop also zeroes the input image.

## The Watch table

Add a variable to the Watch table by typing its name; the field offers the variables and members of the loaded program as you type. To edit a value, focus it and press Enter or `F2`, or double-click it. **Enter** writes the value, **Shift+Enter** prepares it, and **Write prepared values** writes everything prepared at once (**Discard prepared** drops it). A prepared value is never written by itself. The **Display format** list shows values by type, in decimal, hexadecimal, binary, as real or as a time, and a value typed as `16#FF`, `2#101` or `T#1s500ms` is read in that notation. A column header sorts the rows, and a third press restores the order the variables were added in. **Release all forces** is offered while forces are held.

Evidence level: host. `packages/zplc-ide/src/components/watchTable.test.ts` covers the formats, the typed values, the sorting and the completion.

## Live I/O

During a native simulation the **Watch** tab opens by itself and begins with **Live I/O**, the faceplate of the running program. It reads the I/O map of the loaded program, so it lists every input and output by its own name. The inputs are each variable mapped to the input image (`AT %IX0.3`, `AT %IW2`) and each `VAR_INPUT` of a program; the outputs are each variable mapped to the output image (`AT %QX0.5`). Each row has its type, its address and its live value, in the same vocabulary as the Watch table: TRUE, FALSE and a value that has not been read are each a glyph and a word, and a forced value says it is forced.

An input is operated with the control that fits its type:

- A `BOOL` has a switch (**Set TRUE** and **Set FALSE**) that changes only its own bit, and a push button (**Hold**) that keeps it TRUE while you press it, by mouse or with Space or Enter.
- A whole number of up to 16 bits has a slider over the range of its type.
- Every other numeric type has a number box with **Set**.
- A value that does not fit the type is refused with a message before anything is written.

A change reaches the program at a scan boundary, never inside a scan: the runtime queues the write and applies it when the next scan starts. The row says **Pending until next scan** from the moment you act until the runtime holds the value, then **Applied** for a moment. When the runtime cannot apply a change (the simulation is stopped, paused or faulted, or the simulator does not report the capability) the controls are disabled and the panel says why. A paused program is edited from the Watch table, whose write is taken at once. **Force** holds an input at its present value, and **Set** then changes the forced value, for types up to 32 bits; releasing the force hands the input back.

Neither the agent nor the MCP server can operate the faceplate. On hardware, inputs are forced from the Watch table.

Evidence level: host, native POSIX simulation, not hardware. `packages/zplc-ide/src/runtime/declaredInputs.test.ts` and `packages/zplc-ide/src/components/Faceplate.test.tsx` cover the lists, the encoding of every numeric type and what the faceplate says, `test_native_runtime_session.c` proves that a write waits for the start of the next scan, and journey 50 of `bun run test:journeys` operates a switch, a push button and a slider in the real application (LRN-017, IDE-024).

## Live plants

The **Lab** tab starts with **Live plant**: the motor, the conveyor, the tank or the pedestrian crossing of a lesson, running in closed loop with the simulated program. A plant is drawn as a two-dimensional schematic. It reads the outputs of the program and drives the sensors the program reads as inputs, once per scan: the plant is stepped by the scan counter and never by a clock, so it follows the program and not the refresh rate of the window.

A plant is bound to the program by an explicit mapping, a data file `plant-map.json` that every lesson naming a plant ships next to its starter. No signal is found by guessing a variable name. The faceplate sits under the plant, so you operate an input and see the plant react.

**Play / Pause plant**, **Step one scan** (enabled while paused, advances exactly one scan), **Reset plant** and the fault actions are buttons, so the keyboard reaches all of them. The fault actions are: stall the motor; jam the belt and make the next part metal; fail the pump; a pedestrian presses the button and block the crossing. Every lamp of the drawing is a glyph and a word, never a colour alone, and nothing glows or pulses. The text equivalent of the state is the accessible name of the drawing and is announced when the situation changes, not on every scan.

The plant is deterministic: it uses integer arithmetic in permille with a fixed step, and no clock, random number or floating point, so the same program and input script give the same trace on every platform. The recorded run of a scenario is still under **Replay of a recorded run**, which says it is a replay of a recorded native POSIX host run.

Evidence level: host, native POSIX simulation, not hardware. `packages/zplc-ide/src/plants/plantEngine.test.ts` covers each plant and the golden traces, and journey 51 of `bun run test:journeys` runs the motor lesson in the real application with the keyboard alone (LRN-018). The trace hashes were compared on Linux only.

## Debugging boundary

Watches, traces, breakpoints and forces show only what the connected adapter can report. A host trace is not hardware evidence, and a force or a run and stop on a physical system needs explicit human authority and a site safety procedure. AI and MCP tools cannot force values or change run and stop; see [AI and privacy](./ai-privacy.md).

## Declared interlock coverage

A project can declare pairs of outputs that must never be on together, under `safety.incompatibleOutputs` in `zplc.json`. The **Interlocks** tab checks that the saved scenarios assert each pair with an exact `NEVER`, and lists every pair as **Covered** or **Missing exact NEVER coverage**. It needs a saved project opened in the desktop application and says what to do when it cannot run. It checks the scenarios, not the machine: it does not establish physical safety, timing or certification. `zplc-cli safety-check` and the MCP tool `safety_check` give the same answer.

Evidence level: host. `packages/zplc-ide/src/components/InterlockCoverage.test.tsx` renders the view, and journey 33 of `bun run test:journeys` runs the check in the real application.

## One result from the application, the CLI and the MCP tools

A scenario test gives the same result wherever you run it. The **Tests** tab, `zplc-cli test`, `zplc-cli scenario-run` and the MCP tools `tests_run` and `scenario_run` all call the same Tool API on the same native runtime with the same virtual clock, so a temporal assertion (`AT`, `WITHIN`, `FOR`, `EVENTUALLY`, `ALWAYS`, `NEVER`, `UNTIL`, `RISING`, `FALLING`) is judged on the same samples. The verdict, the hash of the compiled program and the hash and length of the recorded trace of each scenario are equal, and a failing assertion fails the same way from each, with the CLI exiting with code 1.

Evidence level: host. `packages/zplc-ide/src/cli/scenarioParity.test.ts` runs every bundled project through the Tool API, the CLI, the MCP dispatcher and the presenter, and compares the results. It does not cover a board.

## Notifications, messages and failures

- **Notifications.** The result of a build, a save, a deploy, a connection change and a test run appears at the bottom right as a notification. Each says what happened and has **Details**, which opens the panel that holds the evidence: **Output** for a save, a successful build, a deploy and a connection, **Problems** for a failed build, **Tests** for a test run. A long operation shows a progress bar, and a build and a test run also show **Cancel**: a cancelled build keeps no artifact, and a cancelled run stops its native runtime. A success goes by itself after a few seconds; a failure, a warning and a cancellation stay until you dismiss them.
- **Problems.** The Problems view lists errors first, then warnings, then information, and activating a problem opens its file at its line and column. A message written to **Output**, or a problem found, while another view is visible puts a count on that view's tab until you open it.
- **Empty, loading and error states.** A panel with nothing to show says why and offers the next step. A loading indicator appears only when an operation takes longer than 300 ms. An error state names what went wrong and has a recovery button.
- **A failure stays in its region.** If the editor, the lower panel or the toolbar throws while it draws, that region shows what stopped and a **Retry** button, and the rest of the window keeps working, so you can still save. If the failure is outside every region, the whole window shows the same message with **Retry** and a way to close the project.

Evidence level: host. `packages/zplc-ide/src/store/notifications.test.ts` and `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` cover the models, and journeys 20 and 36 of `bun run test:journeys` break regions and builds in the real application and follow **Details** to its panel (IDE-021). A deploy notification needs a device and is not covered by a journey.

## Accessibility

ZPLC is built so that its main path can be used with a keyboard and a screen reader. This is what the automated checks prove, and what they do not.

- **Names.** Every field of a form has a label that a screen reader reads with it, and every icon-only button has a name. A CI rule fails the build for a field or an icon-only button without one.
- **Announcements.** Two hidden live regions, one polite for results and one assertive for faults, announce the result of a build, a save, a deploy, a test run, a connection change, and a variable forced or released. Whether the program is running is read from the status bar.
- **Keyboard.** The path from opening a project to one Learn lesson can be completed with the keyboard alone: open, edit, build, simulate, watch, force, the deploy question and the lesson check. Tab and Shift+Tab walk the screen in reading order, and the command palette reaches every command. In the code editor Tab types a tab; press `Ctrl+M` to make Tab move the focus out instead, and again to go back. Escape closes a dialog and gives the focus back to the control that opened it.
- **Controls and density.** Every control comes from one component kit, and a CI rule fails the build for a raw control, a native tooltip, a stock colour or text under 11 pixels. The **Density** preference resizes the controls, rows and spacing of the whole window.
- **Zoom.** `Ctrl` and plus, minus and 0 (`Cmd` on macOS) enlarge, shrink and reset the page, from the **View** menu.
- **What is checked.** Contrast is computed from the colours of the light, dark and high-contrast themes, and a check runs in the real application on Welcome, the four editors, each tab of the results panel, the sidebars, the settings, the palette, the shortcut reference and the deploy question, in each theme. It fails for text below 4.5 to 1 (3 to 1 for large text), a control without a name, a control that shows nothing when focused, a repeated identifier, a screen without a main region and a dialog without a name. These checks are structural and computed, not a test with a screen reader. Checking the main path with a screen reader on Windows and on macOS is a manual task done before the general release, and its result is recorded in the release checklist.

The evidence level of these checks is host: a window on Linux, not Windows or macOS.

## Learn

Learn is the interactive course inside the application. It has a **Learn home**, a page that shows the course and opens with no project open and no network, and a **Learn** view in the primary sidebar that holds the lesson you are working on. Each lesson gives you a starter project in the language of the lesson, goes through the stages Objective, Predict, Edit, Run, Observe and Reflect, and grades your saved program against the lesson's reference scenario on the native simulation, in a process of its own that **Cancel** stops. Your progress is kept in one file in the user-data directory, and you can export and import it from the Learn home.

A result in Learn is host evidence from the native simulation, not hardware evidence, and Learn never starts a physical operation. The course, its modules and its lessons are described in [Learn](../learn/index.md); for educators, see [Educators](../learn/educators.md).
