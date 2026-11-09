---
slug: /development/screen-reader-check
title: Screen reader check
sidebar_label: Screen reader check
description: The recorded check of the main path of ZPLC with the keyboard and Chromium's accessibility tree on Linux, its results in English and Spanish, and the script for a person with NVDA, Narrator or VoiceOver. No screen reader product has been run.
---

# Screen reader check

This page records how the main path of ZPLC was checked for requirements UX-028 and LRN-037, and keeps the script for a person who wants to repeat the check with a screen reader. The record was made on **2026-10-20** on a Linux computer. The script is for someone with NVDA, Narrator or VoiceOver.

:::warning What this record is, and what it is not
On 2026-10-20 the owner decided that this recorded check on Linux is accepted in place of a person with NVDA or JAWS on Windows and VoiceOver on macOS. It is **not** a run of a screen reader product. No screen reader was started. What was recorded is what Chromium gives a screen reader: the role, the accessible name, the description and the state of the focused element, read from its own accessibility tree, and the text of the live regions. How NVDA, JAWS or VoiceOver turn that into speech was not tested, and neither was a Windows or a macOS system.
:::

## The recorded check, 2026-10-20

**Method.** The script `packages/zplc-ide/scripts/screen-reader-capture.ts` starts the real Electron application of this checkout (Electron 43.4.1 at the time, with the native POSIX simulator and no device) on a private display. It opens the **Blinky (Structured Text)** example and walks the steps below with key presses only, once in English and once with the application language set to Spanish. At every stop it saves a screenshot, the accessibility record of the focused element and everything the live regions said.

A step passes when every control reached has a name, the focus is never lost to the page, nothing traps the keyboard, and each state change the step makes is announced.

**Repeat it.** Run it on a Linux display with a built application and native runtime, as for `bun run smoke:journeys`:

```bash
bun run packages/zplc-ide/scripts/screen-reader-capture.ts
```

The options are `--date`, `--out`, `--language en|es`, `--only` and `--strict`. The results of the recorded check are in `docs/static/img/screen-reader-check/2026-10-20/results.json`, with a screenshot per step.

**Row for the release checklist.** Linux, Chromium accessibility tree, recorded 2026-10-20; the owner decision of 2026-10-20 accepts it in place of NVDA/JAWS on Windows and VoiceOver on macOS.

### Result by step

| Step                       | English            | Spanish            | What a person who cannot see the screen was given                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Open                     | Pass               | Pass               | Window title "ZPLC". Tab walks 46 stops on Welcome without a trap: Theme (combo box), **Open project**, **New project**, **Learn**, **Import**, then the examples, each with its name, its role and a short description. After **Open project** the focus is on the editor region ("Editor, main landmark").                                                                                                                                                                                   |
| 2 Edit                     | Pass               | Pass               | The file row reads "Blinky src/main.st, button"; Enter opens it and puts the focus in the editor, named "Code editor for src/main.st. Press Ctrl+M so that the tab key moves the focus out of the editor.", a multi-line text box; the tab reads "main.st, tab, selected". Saving says "Saved main.st". Ctrl+M says "Pressing Tab will now move focus to the next focusable element" and Tab leaves the editor.                                                                                |
| 3 Build                    | Pass               | Pass               | "Build succeeded. Blinky (Structured Text): 302 bytes, 1 task" in the polite region. With a broken program, "Build failed. src/main.st: Compilation of 'main.st' failed: …" in the assertive region, and **Problems** reads "Problems, 6 errors · 0 warnings, tab, selected" with each diagnostic as "Error: … src/main.st:61:9".                                                                                                                                                              |
| 4 Simulate                 | Pass               | Pass               | Tab reaches "Connect, button" in the toolbar. Connecting says "Starting the simulator", "Simulation · native runtime", "Ready", "Simulator ready". F5 moves the focus to "Pause (F6), button" and the status bar region says "Running".                                                                                                                                                                                                                                                        |
| 5 Watch                    | Pass               | Pass               | "Watch, tab, selected"; "Add variable, button"; the field is a combo box named "Variable path…". Enter says "LED_Output added to the watch table." and the focus returns to **Add variable**. The row reads TRUE and FALSE alternately. A changing value is not announced, by design: it is read by moving to its row.                                                                                                                                                                         |
| 6 Force                    | Pass               | Pass               | "Force LED_Output, checkbox"; Space says "Forced LED_Output" and the box reads "checked. Forced until cleared"; unchecking says "Force released on LED_Output". Ending the connection with a force active says "Force released on LED_Output".                                                                                                                                                                                                                                                 |
| 7 Deploy dialog            | Pass, with a limit | Pass, with a limit | The dialog is "Deploy to the device?", an alert dialog. Focus starts on **Cancel**, Tab cycles inside it, the table has the caption "The project compared with the device", and Escape closes it and returns the focus to **Connect**. It was opened by the product's own dialog with fixed device facts, not with a board.                                                                                                                                                                    |
| 8 One Learn lesson         | Pass               | Pass               | Learn home: "Learn, heading", then Close, **Start the course**, the two switches (flipping one says "All lessons are unlocked."), Export, Import. The lesson has a heading and one heading per stage (Objective, Predict, Edit, Run, Observe, Reflect) in a list named "Lesson steps". A hint reads "Hint 2, expanded". **Check** says "Scenario verified. FirstBlink passed 10 recorded assertions."; **Restore the starter** opens an alert dialog and then says "The starter was restored." |
| 9 A plant lesson (LRN-037) | Pass               | Pass               | The plant is an image with the text equivalent of its state, for example "Plant drawing: Motor stopped. ○ COMMAND OFF, ○ AT SPEED OFF, ○ STALL OFF". The faceplate switch is operated with Space and the change is announced: "Motor at speed, 1000 per mille." Pause reads "Plant paused"; the stall action reads "Stall the motor, button, pressed" and says "Motor stalled at 0 per mille: it does not turn, whatever the command." with the drawing reading "▲ STALL FAULT".               |

### What was not run

- **Step 7 with a connected board.** Nobody connected one, so the dialog was checked with the product's own dialog and fixed device facts. It stays unproven for a real device.
- **Device-session announcements.** The **Release all forces** button and the alert "A force is unconfirmed" belong to a device session, because the simulator clears its forces when the connection ends. Their words are covered by the unit tests of the force announcements, not by this record.
- **Screen reader products and systems.** NVDA, JAWS, Narrator and VoiceOver, and Windows and macOS, were not run (owner decision above).

### Defects found and fixed

The check found these defects, and each was fixed in the same change.

| Defect                                                                                                                        | Fix                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| After **Open project** the focus fell to the page body, so a keyboard user started again from the top.                        | The editor region takes the focus when the workbench opens.                   |
| The code editor was named "Editor content" and takes Tab as a character: nothing told a person how to leave it.               | Its name now says that Ctrl+M makes Tab move the focus out.                   |
| Adding a variable to the Watch table dropped the focus to the page body and said nothing.                                     | The focus returns to **Add variable** and the row is announced.               |
| While **Check** ran, the button disabled itself and the focus fell to the page body.                                          | The button stays focused (it is marked unavailable, not disabled).            |
| After **Restore the starter** the focus fell to the page body.                                                                | The button gets the focus back when the restore ends.                         |
| Each stage of a lesson had a disclosure named just "Show expected checkpoint", six times.                                     | Each carries its stage: "Show expected checkpoint: Predict".                  |
| In Spanish the run state said "Running", "Ready" and "Paused" in English, and the status bar refused any text with an accent. | The states are translated and the status bar accepts letters of any language. |

### Left as they are

- Monaco's own message about Tab ("Pressing Tab will now move focus…") and the compiler's diagnostics are in English in a Spanish session.
- The editor shows the sticky line of Monaco as an extra tab stop ("PROGRAM Blinky, list item") when a program is scrolled.
- A changing Watch value is not announced.

### Screenshots

Each picture is the window as the step ended, taken by the script.

![Welcome, with Open project focused](/img/screen-reader-check/2026-10-20/en-1-welcome-open-project.png)

![The workbench after the project opens](/img/screen-reader-check/2026-10-20/en-1-workbench.png)

![The editor after saving](/img/screen-reader-check/2026-10-20/en-2-editor-saved.png)

![A failed build and the Problems panel](/img/screen-reader-check/2026-10-20/en-3-build-failed-problems.png)

![The simulator running](/img/screen-reader-check/2026-10-20/en-4-simulating.png)

![The Watch row of LED_Output and the Add variable button focused](/img/screen-reader-check/2026-10-20/en-5-watch-row.png)

![The deploy dialog](/img/screen-reader-check/2026-10-20/en-7-deploy-dialog.png)

![A lesson after the check passed](/img/screen-reader-check/2026-10-20/en-8-check-passed.png)

![The motor plant stalled](/img/screen-reader-check/2026-10-20/en-9-plant-stalled.png)

## The script for a person with a screen reader

The rest of this page is the script that the recorded check follows. Run it with a screen reader to add the rows this record does not have: NVDA, Narrator and VoiceOver. Where a sentence under "Listen for" differs from the record above, the record is what the application did on 2026-10-20.

### What you need

|                | Windows                                                      | macOS                          |
| -------------- | ------------------------------------------------------------ | ------------------------------ |
| Screen reader  | NVDA (current release) and Narrator                          | VoiceOver                      |
| Start and stop | NVDA: Ctrl+Alt+N. Narrator: Win+Ctrl+Enter                   | Cmd+F5                         |
| ZPLC           | The installer build under test, not the dev server           | The installer build under test |
| Project        | The **Blinky** example copied to an empty folder             | The same                       |
| Device         | None: use **Simulate**. A board is not needed for this check | None                           |

Use the same example and the same steps on both systems, once per screen reader: NVDA and Narrator on Windows, VoiceOver on macOS. Close other applications that speak or play sound.

### How ZPLC speaks

ZPLC has two live regions, mounted once for the window and present before the first message (`packages/zplc-ide/src/ui/LiveRegions.tsx`):

- a **polite** status region, for results: a build finished, a connection, run and stop, a variable forced or released, a lesson restored;
- an **assertive** alert region, for faults: a build or a deploy that failed, and a force that is no longer confirmed.

Messages come from `announce()` in `packages/zplc-ide/src/utils/announce.ts` and from the notification store, which says the title and the detail of each notification, assertively when it is an error. If two messages of the same politeness arrive before the first is read, the last one wins. If you notice a lost message, write down which two and when: that evidence decides whether a queue is needed.

Every dialog must move focus into itself when it opens, keep it inside while it is open, and return it to the control that opened it when it closes. Check this at each dialog below.

### The steps

For each step, do the action, listen, and write down in the results table what you heard and whether it matches. A step passes only when a person who cannot see the screen could have done it and known its result.

#### 1. Open

1. Start ZPLC. Listen for the window title and where focus lands.
2. Move through the welcome screen with Tab. Each button (**Open project**, **New project**, **Learn**, an example) must be announced with its name and role.
3. Activate **Examples**, **Blinky** and choose an empty folder.

Listen for the name of every control as you reach it, never "button" alone or "unlabelled". After the project opens, focus is inside the workbench.

#### 2. Edit

1. Open the program file from the file tree. Listen for the file name and that it is an editor.
2. Change a number in the code and save with Ctrl+S (Cmd+S on macOS).

Listen for the editor announced as a text area you can type in, and the tab as selected. A save is announced as "Saved main.st" in the status region. The editor takes Tab as a character: its name says that Ctrl+M makes Tab move the focus out.

#### 3. Build

1. Run **Build** (Ctrl+B, Cmd+B on macOS).
2. Open **Problems** and **Output** in the bottom panel.

Listen for the polite status "Build succeeded" (or "Build failed" in the alert region if you broke the code on purpose), and in **Problems** each diagnostic read with its file, line and message.

#### 4. Simulate

1. In the toolbar choose **Simulate** and press **Connect**.
2. Press **Run** (F5).

Listen for "Simulator ready" (polite), then the status bar saying "Running". "Execution started" is written to the Output panel only; the status bar is what says it.

#### 5. Watch

1. Open **Watch**, press **+** and type `LED_Output`.
2. Wait a few seconds.

Listen for the new row announced with its name and value, and the value changing between TRUE and FALSE. The table does not announce every change on its own, so move to the row and read it twice a second apart. Record whether you can tell that the value is changing.

#### 6. Force

1. In **Watch**, mark **Force** on `LED_Output` and set a value.
2. Release it. Then force it again and use the release-all command.

Listen for "Forced LED_Output", then "Force released on LED_Output". When several forces are released together on a device, you hear "All forces released". If a device connection is lost while a force is active, the alert region says "A force is unconfirmed: verify and reconnect before operating". Neither of those two is reachable in the simulator, which clears its forces when the connection ends.

#### 7. Deploy dialog

The deploy dialog is shown for a device, not for the simulator. Without a board you cannot open it, so this step stays **not run** in a check on a bench without hardware. Record that, and do not mark it as passed. If a person at the bench has a board connected:

1. Choose **Deploy**.
2. Listen for the title "Deploy to the device?", the description (it says that deploy leaves the PLC stopped and that Run is a separate action), and the comparison table with its caption and column headers.
3. Close the dialog with Escape.

Listen for focus moving into the dialog on open, staying inside it with Tab, and returning to the **Deploy** button on close.

#### 8. One Learn lesson

1. From the welcome screen choose **Learn** and then **Start** on the first lesson.
2. Read the lesson, make the edit it asks for, run the check.
3. Use the reset action once.

Listen for the lesson panel read in order, the result of the check, and after the reset the message "The starter was restored.". Listen also for the text equivalent of any plant picture: a change of situation must be said, not only shown.

### Record the results

Copy this table into the release checklist, one row per screen reader and step. Write what you heard in your own words. Mark a step **Pass**, **Fail** or **Not run**, and say why for the last two.

| Date | Tester | Screen reader and version | System | ZPLC version | Step            | Heard | Focus correct | Result | Notes |
| ---- | ------ | ------------------------- | ------ | ------------ | --------------- | ----- | ------------- | ------ | ----- |
|      |        |                           |        |              | 1 Open          |       |               |        |       |
|      |        |                           |        |              | 2 Edit          |       |               |        |       |
|      |        |                           |        |              | 3 Build         |       |               |        |       |
|      |        |                           |        |              | 4 Simulate      |       |               |        |       |
|      |        |                           |        |              | 5 Watch         |       |               |        |       |
|      |        |                           |        |              | 6 Force         |       |               |        |       |
|      |        |                           |        |              | 7 Deploy dialog |       |               |        |       |
|      |        |                           |        |              | 8 Learn lesson  |       |               |        |       |

A failed step is a defect: file it with the step number, what you heard and what you expected. The release does not claim screen reader support until every row of both systems is **Pass**, or a **Not run** row is explained in the release notes.

## See also

- [Keyboard reference for the visual editors](../reference/visual-editor-keyboard.md)
- [ZPLC workbench](../ide/features.md)
- [Hardware in the loop](./hardware-in-the-loop.md)
