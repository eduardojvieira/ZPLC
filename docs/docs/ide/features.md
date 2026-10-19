---
slug: /ide/features
id: features
title: Studio Workbench
sidebar_label: Workbench
description: The ZPLC Studio 2.0 editor, bottom panel, simulation, and test workflow.
tags: [ide, user-guide]
---

# Studio Workbench

The workbench keeps editing central. An activity rail and a primary sidebar on the
left hold the project navigator, search, tests, and the lessons; an optional
secondary sidebar on the right holds the Inspector; and a results panel under the
editor holds Output, Problems, Tests, Interlocks, Lab, Changes, Agent, Trace,
Watch, and Terminal.

## Daily workflow

1. Work in a user-selected project folder.
2. Compile and resolve diagnostics.
3. Run a temporal test or native POSIX scenario and inspect its trace.
4. Review the evidence source before drawing a conclusion.

## Layout, navigator, and configuration editors

The window has these regions, from the top: the application menu, the command bar
(the build, connect, and run controls, the project name, and the command palette
button), then, side by side, the **activity rail**, the **primary sidebar**, the
**editor area** over the **results panel**, and the **secondary sidebar**, and
last the status bar.

- **Activity rail.** Project, Search, Tests, and Learn. Choosing one swaps the
  primary sidebar; the chosen one is marked by a bar at its edge and a filled
  button, not by colour alone. Tests also shows the test results panel.
- **Primary sidebar.** Stays visible together with the results panel. Project shows
  the navigator; Search finds text in the project; Tests explains the scenarios and
  opens the results; Learn holds the lessons.
- **Secondary sidebar.** The Inspector. It is optional and starts hidden, so that the
  editor keeps its width: show or hide it with the Inspector button of the command bar or
  **View > Show or hide the secondary sidebar**. The function-block palettes of the
  Ladder and function block diagram editors stay inside those editors.
- **Results panel.** Output, Problems, Tests, Interlocks, Lab, Changes, Agent,
  Trace, Watch, and Terminal. Hide it with **View > Show or hide the results panel**.

**View > Show or hide the primary sidebar** is `Ctrl+Alt+B`, the secondary sidebar is
`Ctrl+Alt+I`, and the results panel is `Ctrl+Alt+J` (⌘⌥ on macOS). **Show the project
navigator** is `Ctrl+Shift+E` and **Search in the project** is `Ctrl+Shift+F`. Which
sidebars are shown and which activity is selected are kept between sessions.

### Navigator by PLC objects

The navigator has two modes, chosen with the toggle in its header and remembered:

- **Objects** (the default) groups the project as **Programs**, **Function blocks**,
  **Functions**, **Data types**, **Global variables**, **Tasks**, **I/O mapping**,
  **Communication**, and **Device**. The first five come from the compiler's reading
  of the Structured Text files (a file that declares several objects is listed under
  each kind it declares) and, for Programs, from the diagram and instruction list
  files. The others come from `zplc.json`. Choosing an object opens its file at its line,
  or its configuration editor.
- **Files** is the file tree with the Declarations section and the library folders.

### Configuration editors

**Tasks**, **I/O mapping**, **Network**, **Communication**, and **Target** each open as
a tab of the editor area, from the navigator or from the list in the Settings tab.
Each tab holds the same form the settings page held, with every setting it offered;
the Settings tab keeps the project metadata and the application preferences. All the
tabs edit one document, `zplc.json`: **Save configuration** writes it, and closing the
last tab that shows it with unsaved edits asks whether to save, discard, or keep editing.

### Search

Search looks for text in the Structured Text and instruction list files of the project,
including the changes that are not saved, with or without matching case, and lists the
matches by file. Choosing a match opens the file at that line. It does not search
diagrams, which are stored as models.

### Moving the separators

Each separator between two regions is a thin bar that lights up under the pointer, fills
while you drag it, and shows the focus ring when it has the keyboard focus. With the
focus on a separator, the arrow keys move it by 5 points, Shift with an arrow moves it
by 15, Home and End take it to its limits, and Enter collapses or restores the panel
next to it. A double click restores the default size. Each has an accessible name and
reports its size to assistive technology. The sizes of the sidebars are kept between
sessions, and the split of the editor and the results panel is kept for each project.

### Window sizes

The main path (open a project, edit, build, simulate, watch) fits a window of 1366 by 768
pixels with no clipped control. The window can be as small as 1024 by 768: below
1100 pixels wide the rail shows icons only, the secondary sidebar hides itself, and the
theme, settings, and shortcut commands move into the **More commands** menu of the
command bar.

Evidence level: host. The unit tests of requirements UX-011, UX-012, UX-013 and UX-017
(`packages/zplc-ide/src/shell/`, `src/navigator/`, `src/layout/separatorSteps.test.ts`,
`src/store/useConfigEditors.test.ts`, `src/store/useShellLayout.test.ts`) and the journey
"The shell fits 1366 by 768 and 1024 by 768, and its separators move from the keyboard"
(`packages/zplc-ide/scripts/journeys.ts`, UX-023) cover them on the development host.
No packaged, macOS, or Windows window was measured.

## Recent projects and session restore

The Welcome screen offers **Open project**, **New project**, **Learn** and the bundled examples. The examples are grouped by topic and, inside a topic that holds several levels, by level (Beginner, Intermediate, Advanced); the names of levels, languages, boards and topics follow the interface language. A project that cannot be opened is reported on the screen, next to the action, never in a system message box.

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
| Language | Automatic, English, Español | Automatic: it follows the language of the operating system, and sets the whole interface and the Learn lessons (see [Interface language](#interface-language)) |
| Autosave | Off, or after 5, 15, 30 or 60 seconds without typing | Off |
| Check for a newer release when Studio starts | On or off, and a **Check now** button | Off |

Autosave writes the modified files with the same save as **Save all**, without a line in Output for each save; a file that cannot be written stays modified and is reported. Together with the recovery copies, a crash costs at most the typing of the last second.

The update check asks the GitHub releases of this project for the latest published release and says whether it is newer than the running build. It sends nothing about you, downloads nothing and installs nothing; the answer is a version and a link. It never runs until you turn it on or press **Check now**.

Evidence level: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `src/store/useAppSettings.test.ts`, `src/store/autosave.test.ts`, `electron/updateCheck.test.ts` and `electron/updateCheckIpc.test.ts` cover the settings, autosave and the update check (requirements IDE-007 and IDE-010), and journey 21 (preferences apply and persist per user) of `bun run test:journeys` changes them in the real application and restarts it.

## Interface language

The **Language** preference chooses the language of Studio: **Automatic**, **English** or **Español**. Automatic, the default, follows the language of the operating system (`es`, `es-AR` and `es-MX` give Spanish; every other language gives English). The choice applies at once, without a restart, and also sets the language of the Learn lessons and the `lang` of the window. The Spanish text is neutral Latin American Spanish with impersonal or "usted" forms, as in an industrial manual.

Every text of the interface is in two catalogs, `packages/zplc-ide/src/i18n/en.ts` (the source) and `es.ts`. The texts of one screen live in a module of their own, `packages/zplc-ide/src/i18n/catalog/<screen>.ts` (`console.ts`, `mqtt.ts`, `toolbarMsg.ts`, `examples.ts` and so on), which holds both languages side by side and which `en.ts` and `es.ts` merge. The name of the product is written once for the renderer (`src/productName.ts`) and once for the main process (`electron/productName.ts`); the catalogs and the window title interpolate it, and `electron/productName.test.ts` proves the two agree with the title of `index.html`. To add a text:

1. Add the key and its English text to the module of the screen (or to `en.ts` for a shared text): a dotted name from the screen to the text (`welcome.open.title`), `{name}` where a value goes, and a `.one` and `.other` pair for a count.
2. Add the same key, in Spanish, to the same module (or to `es.ts`). A missing or an extra key is a TypeScript error, and a different `{name}` is a failure of `tools/ci/i18n-guard.ts`.
3. Write it in the component with `const { t, tn } = useT()` and `t('welcome.open.title')`, or `tn('explorer.migration.review', count)` for a plural. Outside a component (a menu, a dialog, an error) use `t` from `src/i18n`.

The text is in sentence case, has no exclamation mark and uses no internal term, and the Spanish text uses no voseo (UX-030): the guard fails on all four. `bun run lint:ide` runs the guard: it fails on a text hard-coded in a component (JSX text, or a string in `aria-label`, `placeholder`, `alt`, `label`, `tooltip`, `title` or `description`) and on a catalog that breaks those rules. The components that still hold hard-coded text are on `tools/ci/i18n-offenders.json`, a list that only shrinks.

Evidence level: host. `packages/zplc-ide/src/i18n/i18n.test.tsx`, `tools/ci/i18n-guard.test.ts` and `src/utils/appSettings.test.ts` cover the catalogs, the language setting and the guard (requirements UX-029, UX-030 and UX-031).

## Application menu, command palette and shortcuts

Studio keeps one list of commands, and every way to start a command reads it: the application menu, the command palette, the keyboard shortcuts, the shortcut hints in the tooltips and the shortcut reference. A command therefore does the same thing wherever you start it.

- **Application menu.** File, Edit, View, Project, Build, Online, Debug and Help, on Windows, Linux and macOS alike (macOS adds its application menu and a Window menu). The menu is in the language of the **Language** preference and changes with it. A packaged build has no reload or developer-tools item. The View menu keeps page zoom: Zoom in, Zoom out and Actual size, on Ctrl and plus, Ctrl and minus, and Ctrl and 0 (Cmd on macOS). The Edit menu holds the system clipboard and undo items that the editors and text fields use.
- **Command palette.** Press Ctrl+Shift+P (Cmd+Shift+P on macOS), type a few letters of a command, choose with the arrow keys and press Enter. The palette lists every command, so each one is reachable from the keyboard even when it has no shortcut. A command that does not apply now (for example Deploy without a connection) is listed as not available and does not run.
- **Shortcut reference.** Open **Help** > **Keyboard shortcuts**, or press Ctrl+K and then Ctrl+S, to see every command with its shortcut. The tooltips of the toolbar show the same shortcut after the name of the button.

| Shortcut | Command |
|---|---|
| Ctrl+S | Save |
| Ctrl+B | Compile the project |
| F5 | Run, or resume when paused |
| Shift+F5 | Stop |
| F6 | Pause |
| F10 | Step one cycle |
| F8 | Reset the runtime |
| Ctrl+Shift+P | Command palette |
| Ctrl+K, then Ctrl+S | Keyboard shortcuts |

Cmd replaces Ctrl on macOS. The shortcuts that act on a program (F5, F6, F10, F8, Shift+F5) leave a text field its own keys.

**Commands that act on a device.** Connect, Disconnect, Deploy, Run, Pause, Stop, Step and Reset run the same action as the toolbar button of the same name, with the same checks and the same confirmation: Deploy still asks before it sends a program. Choosing one from the menu or the palette adds no way around them. They are controls for the person at the keyboard: the MCP tools and the optional AI provider have no access to the commands, and cannot flash, deploy, force, run or stop anything. A menu item for a command that the current state does not offer is not run, and Output says so.

Evidence level: host. `packages/zplc-ide/src/commands/commands.test.ts` and `electron/appMenu.test.ts` (requirements UX-014 and UX-015) check that no two commands share a shortcut, that every menu item and palette entry is a registered command, that every command has a title in both languages, and the shape of the menu on Windows, Linux and macOS with a stand-in for the platform. The native menu has not been run on Windows or macOS.

## Empty, loading and error states

A panel that has nothing to show says why and offers the next step, instead of staying blank. Output, Problems, Trace, Watch, the project Explorer, the Inspector and the Tests tab (when no project folder is open) show a title, one sentence and a button. When the button stands for a command (Compile the project, Step one cycle, Connect, Open project) it is that command, so it does the same as the menu and the palette and is disabled while the command is not available. Watch offers **Add a variable**, and the Explorer offers **New file**.

A loading indicator appears only when an operation takes longer than 300 ms, so a fast panel never flashes a spinner. An error state names what went wrong and has a recovery button; the workbench that fails to load shows one with **Retry**. The three states are components of the kit (`EmptyState`, `LoadingState`, `ErrorState`) and appear in the component gallery of development builds.

## Window start

Studio opens its window hidden and shows it once the page has painted, in the colour of the theme you chose, so a dark theme does not flash white on start. The window title is the product name. The language and the theme are reported to the main process whenever they change and kept in a small file in Studio's private user-data directory, so the next start already has the right menu language and window colour; a missing or damaged file falls back to English and the system theme.

Evidence level: host. `packages/zplc-ide/electron/shellPreferences.test.ts`, `src/components/panelStates.test.tsx`, `src/ui/kit.test.tsx` and `src/ui/logic/delay.test.ts` (requirements UX-016 and UX-021) cover the window colour, the stored preferences, the empty, loading and error states and the 300 ms delay. The window has not been observed on Windows or macOS.

## Files and folders in the project tree

In the Files mode of the navigator, the header has **New File** and **New Folder**. A right click on a file or a folder (or F2 for a rename) opens its actions:

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

## Declared interlock coverage

A project can declare pairs of outputs that must never be on together, under `safety.incompatibleOutputs` in
`zplc.json`. The **Interlocks** tab checks that the saved scenarios assert each pair with an exact `NEVER`, and lists
every pair as **Covered** or **Missing exact NEVER coverage**. It is a view of its own, not part of Problems or Tests.
It needs a saved project opened in the desktop app and the linked `zplc.json`, and it says what to do when it cannot
run. It checks the scenarios, not the machine: it does not establish physical safety, timing or certification.
`zplc-cli safety-check` and the MCP tool `safety_check` give the same answer.

Evidence level: host. `src/components/InterlockCoverage.test.tsx` renders the view, `workspaceSafetyPresentation.test.ts`
covers the answer, and journey 33 of `bun run test:journeys` runs the check in the real application.

## One result from Studio, the CLI and the MCP tools

A scenario test gives the same result wherever you run it. Studio's **Tests** tab, `zplc-cli test` and
`zplc-cli scenario-run`, and the MCP tools `tests_run` and `scenario_run` all call the same Tool API, on the same
native POSIX runtime with the same virtual clock, so a temporal assertion (`AT`, `WITHIN`, `FOR`, `EVENTUALLY`,
`ALWAYS`, `NEVER`, `UNTIL`, `RISING`, `FALLING`) is judged on the same samples. The verdict, the hash of the compiled
program, the hash and length of the recorded trace of each scenario, and, where an entry point shows them, the
assertions and the sampled outputs are equal. A failing assertion fails the same way from each, with the CLI exiting
with code 1.

Evidence level: host. `src/cli/scenarioParity.test.ts` runs every bundled project, each scenario by itself, and a
project with a failing assertion through the Tool API, the CLI, the MCP dispatcher and the Studio presenter, and
compares the results. It does not cover a board.

## Declarations and library folders

Under the file tree, the Files mode of the navigator has a **Declarations** section (closed until you open it with its heading, which
shows how many there are and how many files are not compiled). It lists the declarations of the project: the programs,
function blocks, functions, interfaces and data types that its Structured Text files declare, grouped under their
file. Choosing one opens its file with the cursor on its name. The list covers the files the build reads and follows
what you type.

The build reads the Structured Text files directly in `src` and directly in each **library folder** that `zplc.json`
lists under `libraries` (CMP-046), and everything they declare is visible to every program:

```json
{ "libraries": ["lib", "vendor/acme"] }
```

A library is a relative path of plain names with `/`, inside the project, listed once; `src` and `tests` are not
libraries. **Library folder...** in the Declarations section adds one (and writes `zplc.json`), its **x** takes it away,
and the file tree marks the folder `library`. The declarations of a library appear in the Declarations list, in the
palettes of the FBD and LD editors (the **Project** group) and in the completion and hover of the ST editor.

A Structured Text file that is neither in `src` nor directly in a library folder is read by no build, and Studio says
so the way the build does: the file is marked `not compiled` in the tree, the section lists its folder with a **List as
library** button, and **Build** reports `SOURCE_NOT_COMPILED`. A folder inside a library is not read either; list it as
a library of its own. A library folder that is renamed or deleted stays in the list, marked "not in the project", until
you remove it. A project that is waiting for its version 1 migration to be applied cannot change its libraries until it
is.

Evidence level: host. `src/project/libraries.test.ts`, `src/project/unlistedSources.test.ts`,
`src/store/projectSources.test.ts` and `src/langsvc/assist.test.ts` cover the rules, the sources
and the editor services; journey 32 of `bun run test:journeys` lists a library in the real application, checks the
tree, the Ladder palette and the cursor, and builds the project with it.

## Project archives

**Export Project Archive** (the Build options menu) writes the open project to one file, a zip, that you choose in the
system save dialog. **Import a project archive** (the Welcome screen) reads one back into an equivalent project:

1. Choosing the archive reads it and writes nothing. A dialog says what it holds (its files, folders and size), whose
   project it is, and, for a version 1 project, the lines that migrating it changes in `zplc.json`.
2. **Choose a folder and import** asks for an empty folder, writes the files there byte for byte, and opens the project.
   A folder that is not empty is refused, and an import that fails leaves the folder empty again.

The archive holds the files as they are on disk, so Studio asks you to save modified files first. It leaves out what
the project tree hides (`node_modules`, `.git`, `build`, `dist` and `.vscode`) and links. An archive made on one
machine is the same bytes as one made on another: entries sorted by path, stored without compression, dated
1980-01-01, names in UTF-8. Studio reads archives that other tools wrote (stored or deflated), and refuses one that
holds an absolute path, a `..`, a name two systems read differently, a link, an encrypted entry, two files that differ
only by case, a file that does not match its checksum, more than 4096 files, a file over 16 MiB or more than 64 MiB in
all. **Export Project** next to it keeps writing the JSON document of the files and the configuration (without its
secrets); that document does not import.

Evidence level: host. `electron/projectArchiveZip.test.ts` and `electron/projectArchive.test.ts` cover the format, the
refusals and a round trip on real folders; journey 30 of `bun run test:journeys` exports and imports a project in the
real application and compares the two folders.

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

## Live I/O

During a native simulation the **Watch** tab, which opens by itself when the simulation
starts, begins with **Live I/O**: the faceplate of the running program. It reads the
I/O map of the program that is loaded, so it lists every input and every output by its
own name, whatever the name is. The inputs are each variable mapped to the input image
(`AT %IX0.3`, `AT %IW2`) and each `VAR_INPUT` of a program; the outputs are each
variable mapped to the output image (`AT %QX0.5`). Each row has its type, its address
and its live value, and an output reads in the same vocabulary as the Watch table:
TRUE, FALSE and a value that has not been read are each a glyph and a word, and a
forced value says it is forced.

An input is operated with the control that fits its type. A BOOL has a switch (**Set
TRUE** / **Set FALSE**) that changes only its own bit, and a push button (**Hold**)
that keeps it TRUE while you press it, by mouse or with Space or Enter, and lets it go
when you release it. A whole number of up to 16 bits has a slider over the range of its
type; every other numeric type has a number box with **Set**, which also takes a typed
value for the small types. A value that does not fit the type is refused with a
message before anything is written.

A change reaches the program at a scan boundary, never inside a scan: the runtime
queues the write and applies it when the next scan starts. The row says **Pending until
next scan** from the moment you act until the runtime holds the value, then **Applied**
for a moment, and the application announces the applied change to a screen reader. A
press and a release that land between two scans are each seen by a whole scan. When the
runtime cannot apply a change (the simulation is stopped, paused, has faulted, or the
simulator does not report the capability) the controls are disabled and the panel says
why in words. A paused program may be holding a scan at a breakpoint, and a change never
reaches a scan that has begun, so a paused program is edited from the Watch table, whose
write is taken at once as a debugger's write always was. **Force** holds an input at its present value (and **Set** then changes the
forced value), for the types up to 32 bits that a force carries; releasing the force
hands the input back.

The faceplate writes with the typed memory write, at the address and width of the debug
map; the runtime keeps `simulation.input.set` for the three motor names of the starter
programs. Neither the agent nor the MCP server can operate the faceplate: they have no
tool that sets an input or writes memory. On hardware, inputs are forced from the Watch
table.

Evidence level: host. `packages/zplc-ide/src/runtime/declaredInputs.test.ts`,
`ioMap.test.ts` and `faceplateState.test.ts` cover the lists, the encoding of every
numeric type, the range of a slider and the pending state; `src/components/Faceplate.test.tsx`
covers what the faceplate shows and says; `test_native_runtime_session.c` proves that a
write waits for the start of the next scan; and journey 50 of `bun run test:journeys`
operates a switch, a push button and a slider of a project with custom names in the real
application, with the keyboard alone as well, and sees the program's output follow
(requirements LRN-017, IDE-024). Native POSIX host evidence, not hardware.

## Live plants

The **Lab** tab starts with **Live plant**: the motor, the conveyor, the tank or the pedestrian crossing of a lesson, running in closed loop with the simulated program. A plant is drawn as a two-dimensional schematic. It reads the outputs of the program (the motor command, the belt, the pump, the lamps) and drives the sensors the program reads as inputs (at speed, part present, level low and high, jam, pedestrian request), once per scan of the runtime: the plant is stepped by the scan counter and never by a clock, so it follows the program and not the refresh rate of the window.

A plant is bound to the program by an explicit mapping, a data file `plant-map.json` that every lesson naming a plant ships next to its starter (`packages/zplc-ide/lessons/<lesson>/plant-map.json`): plant signal to `Program.Name`. The panel offers the mappings that bind to every I/O point of the loaded program; no signal is found by guessing a variable name. The faceplate sits under the plant, so you operate an input and see the plant react.

**Play / Pause plant**, **Step one scan** (enabled while paused, advances exactly one scan), **Reset plant** and the fault actions of the plant are buttons, so the keyboard reaches all of them. The fault actions are: stall the motor; jam the belt and make the next part metal; fail the pump; a pedestrian presses the button and block the crossing. A fault button says whether it is on. Every lamp of the drawing is a glyph and a word (for example `● COMMAND ON`, `▲ STALL FAULT`), never a colour alone, nothing glows or pulses, and the drawing is redrawn when the plant steps, so reduced motion has nothing to switch off. The text equivalent of the state (for example "Motor stalled at 0 per mille") is the accessible name of the drawing, is shown under it and is announced when the situation changes (stalled, at speed, jammed, low), not on every scan.

The plant is deterministic: it uses integer arithmetic in permille with a fixed step, and no clock, random number or floating point, so the same program and input script give the same trace on every platform. A golden test pins the hash of the trace of each plant.

The recorded run of a scenario is still there under **Replay of a recorded run**, and says that it is a replay of a recorded native POSIX host run, not live and not runtime, hardware or HIL evidence.

Evidence level: host. `packages/zplc-ide/src/plants/plantEngine.test.ts` covers each plant and the golden traces, `plantMap.test.ts` and `lessonPlantMaps.test.ts` the mapping against the real compiled starter of every plant lesson, `plantLoop.test.ts` the closed loop over a fake program, `plantFacts.test.ts` and `PlantView.test.tsx` the text equivalent and the drawings, and journey 51 of `bun run test:journeys` runs the motor lesson in the real application: operates an input, sees the plant react, pauses, steps and stalls it with the keyboard alone and sees the announcements and the replay label (requirements LRN-018; partly LRN-019, LRN-020, LRN-021, LRN-037). Native POSIX host evidence, not hardware. The trace hashes were not compared across Linux, macOS and Windows runners: only Linux was run.

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
list) and `src/components/NotificationsList.test.tsx` the drawing; journey 36 of
`bun run test:journeys` saves, builds, connects, runs and cancels a long test run
and breaks the build in the real application, and follows **Details** of each
notification to its panel (requirement IDE-021). A deploy notification needs a
device and is not covered by a journey.

## What loads at start

The Welcome screen is the first thing Studio shows, and it loads without the code editor, the visual editors or the
project settings. Each of them loads the first time you open a file of its kind or the settings, and the editor area
says "Loading editor..." for that moment. Studio bundles the part of Monaco it uses (the editor, search, folding,
suggestions, hover, go to definition and references, and the difference view), and not its CSS, HTML, JSON and
TypeScript language services or its other languages. The installer holds no source maps.

Evidence level: host. `packages/zplc-ide/scripts/welcomeBundle.test.ts` builds Studio, reads the chunks the Welcome page
loads at start and the files the installer packages; journey 29 (the Welcome screen loads no editor) of
`bun run test:journeys` checks the same in the development host of the real application. No packaged installer was
inspected.

## Editors

ST is the primary language-service path. LD, FBD, and SFC open, edit, save,
copy, and undo their semantic models; their generated ST is an artifact, not a
round-trip source. IL remains a compatibility surface where its compiler path
accepts it.

## Simulation and hardware

Native POSIX simulation is the way to run a program on your computer. It needs
the desktop app, which includes the native runtime. Where the native runtime
cannot start, and in the web build, the simulation runs on the WebAssembly
runtime, and the status bar says so and lists what it does not have (no
communication blocks, no serial, no pins, the timing of a browser): see [Browser
runtime](../runtime/browser-runtime.md). Hardware actions are separate:
build runtime firmware, flash runtime firmware, deploy a compiled program, then
run/debug. A person starts each of them.

## Learn

Learn has two parts: the **Learn home**, a page that shows the course, and the **Learn** view of the primary sidebar, which holds the lesson you are working on. This is what it offers today:

- 26 lessons, in Spanish and in English (the toggle is in the panel; by default it follows the language of the application). Each lesson is a data package, `packages/zplc-ide/lessons/<id>/`, with its text in both languages, learning objectives, two levels of hint, a reference scenario with its content hash, and the example project you start from: a Structured Text file, or a Ladder file in lesson 5.
- The lessons sit in a course: `packages/zplc-ide/lessons/course.json` lists the twelve modules of the curriculum in order, each with a level (Foundation, Intermediate, Advanced), the module it requires and the tracks it offers (Simulation, Hardware), and each lesson names its module, level, prerequisites and tracks in its own manifest. A lesson that does not support a track says why and what to do instead. The generator `bun tools/ci/generate-lesson-index.ts` validates the file and the placement of every lesson (module exists, same level, tracks the module offers, no prerequisite in a later module) and embeds the course in the generated lesson index. Six modules have no lesson yet and stay empty until the course outline is written; Studio shows them as empty, with no invented lesson.
- Every lesson goes through the stages Objective, Predict, Edit, Run, Observe and Reflect, the expected checkpoint of each stage stays hidden until you ask for it, and the two hints open on request. Each hint you open is recorded in your progress. The reference solution opens only after you confirm, and the progress records that you looked at it.
- **Open the workspace**, in the Learn view of the sidebar (or **Start** in the Learn home), makes the workspace of the lesson from its starter and opens it, with no copy step. The desktop app keeps the workspace in its own user-data folder, `learn-workspaces/<lesson id>`, so no folder dialog appears and nothing is copied by hand; every later start reopens it with your edits untouched. (A browser build that cannot give the app such a folder asks for one folder the first time, as before.) The lesson stays visible beside the editor: on the Learn rail it fills the primary sidebar, and when you switch the rail to Project, Search or Tests it moves to the secondary sidebar, next to the Inspector, which is one choice away. **Restore the starter** puts the starter's files back after you confirm; files you added stay. You edit your workspace, save it and press **Check**. Studio runs your saved program against the scenario of the lesson package, identified by its content hash, in a process of its own that **Cancel** stops; the scenario files of your folder are never read, so editing a scenario there does not produce a pass. A lesson counts as completed when every assertion of that scenario passed. A failed check lists each failed assertion with its instant, the values expected and observed, and the address of that sample in the recorded trace. The grade record holds the lesson id and version, the scenario hash, the program hash, the runtime version and the time. You can still run the scenario of your folder from **Tests**; that run is not the grade.
- Studio keeps your progress in one versioned file in its user-data directory: passed lessons with their grade record, lessons in progress, the last lesson (the panel opens it again), and each hint level shown (level 1 and level 2 are recorded separately) and whether the solution was shown (the reference solution opens on request). A progress file written by an earlier build, which kept only the highest hint level, is read and migrated the next time it is saved. The progress file of an earlier release is migrated, and left where it was. **Export progress** and **Import progress**, in the Learn home, move the whole document as a file; an import is validated, merged with the newest grade first, and keeps lessons this build does not know. A file that is refused says why (too large, not JSON, not a progress file, a version this Studio cannot read, or damaged) and leaves your progress as it was.
- The **Learn home** is a page of its own that opens with no project open and no network: from **Learn** on the Welcome screen, from the **Learn** item of the activity rail, and from **Open the Learn home** in the Help menu. It lists the tracks (Simulation, Hardware) and the twelve modules in order, each with its level, the module it requires and its estimated time, and under each module its lessons with their state in words, never by colour alone: Locked, Available, In progress or Passed. A lesson says which tracks it supports and, for a track it does not support, its own reason and what to do instead (written in the lesson package, in both languages). **Continue** resumes the last lesson you worked on, or starts the course for a new learner. Escape or **Close** returns to the editor, which stays as it was.
- A lesson is locked until the lessons it requires are passed, and the home says which ones. **Unlock all lessons**, in the home, lifts the lock for every lesson: it is a saved setting and Studio announces the change. A lesson you have started or passed is never locked again. In the Learn view of the sidebar a locked lesson cannot be chosen.
- **Classroom: hide reference solutions**, in the Learn home, is a saved setting of this computer. While it is on, Learn offers no reference solution and says so. For educators, `bun tools/ci/learn-educator.ts` verifies an exported progress file against the lesson hashes and prints the course outline; see [Educators](../learn/educators.md). None of it needs an account or a server.
- Learn never starts a physical operation: it only copies a project and opens **Tests**.
- A result is host evidence from the native simulation, not hardware evidence.

A track for a learner board and the lessons of the six empty modules are future work (the LRN requirements). Nothing on this page promises them. To add a lesson, see [Contributing](../contributing/index.md#adding-a-lesson).

Evidence level: host. `packages/zplc-ide/src/learn/lessonCi.test.ts` runs every lesson package in both languages (the starter fails its scenario, the solution passes it, every time and value the text quotes is in the scenario), `packages/zplc-ide/src/learn/lessonCheck.test.ts` grades programs on the native runtime, `packages/zplc-ide/electron/ipcRegistry.test.ts` covers the lesson check and the progress channels at the IPC boundary, and journeys 39 and 39b run the check in the real application.

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

## Accessibility

Studio is built so that its main path can be used with a keyboard and a screen reader. What the automated checks prove is stated here, and what they do not.

- **Names.** Every field of a form has a label that a screen reader reads with it, and every button that shows only an icon has a name. A CI rule (the component-kit guard) fails the build for a field or an icon-only button without one, and a check in the running application lists any control without a name on the main screens.
- **Announcements.** Studio keeps two hidden live regions for the whole window: a polite one for results and an assertive one for faults. The result of a build, a save, a deploy, a test run and a connection change is announced through them, with its detail, and so is a variable that is forced or released. An error, and a force that is no longer confirmed, is announced at once. Whether the program is running or stopped is read from the status bar, which keeps its own persistent status.
- **Keyboard.** The path from opening a project to one Learn lesson can be completed with the keyboard alone: open, edit, build, simulate, watch, force, the deploy question and the lesson check. Tab and Shift+Tab walk the screen in reading order, and the command palette (Ctrl+Shift+P) reaches every command. A command that shows a panel, such as **Show watched variables**, leaves the focus on it. In the code editor Tab types a tab; press Ctrl+M to make Tab move the focus out instead, and press it again to go back. Escape closes a dialog, the palette and the shortcut reference and gives the focus back to the control that opened it, and Tab leaves a diagram after its last node.
- **Zoom.** Ctrl and plus, Ctrl and minus, and Ctrl and 0 (Cmd on macOS) enlarge, shrink and reset the page. They are in the **View** menu.
- **What is checked.** Contrast is computed from the colours of the light, dark and high-contrast themes. A check also runs in the real application, on Welcome, the editors (Structured Text, Ladder, function block diagram and sequential function chart), each tab of the results panel, the sidebars, the settings, the command palette, the shortcut reference and the deploy question, in each of the three themes. For every visible text it computes the contrast against what the text is drawn on (4.5 to 1, or 3 to 1 for large text), and it fails for a control without a name, a control that shows nothing when it has the keyboard focus, a repeated identifier, a reference to something that is not on the page, a screen without a main region, and a dialog without a name. These checks are structural and computed, not a test with a screen reader. Checking the main path with a screen reader on Windows and on macOS is a manual task that is done before the general release, and its result is recorded in the release checklist.
