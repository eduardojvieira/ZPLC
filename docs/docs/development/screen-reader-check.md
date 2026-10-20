---
slug: /development/screen-reader-check
title: Screen reader check
sidebar_label: Screen reader check
description: The manual script for checking the main path of ZPLC with NVDA, Narrator and VoiceOver before a release, with what to listen for and a table to record the result. No agent has run it.
---

# Screen reader check

This is the script for requirement UX-028: before general availability, a person
checks the main path of ZPLC with a screen reader on Windows and on macOS and
records the result.

:::warning A manual check that no agent has run
This page is a script for a person with a screen reader. It was written from the
source of ZPLC, and **nobody has run it yet**: no screen reader was started to
write it, so the sentences under "Listen for" are what the code is built to say,
not something anyone heard. Until the results table below is filled in by a
person and kept with the release checklist, the main path has no screen reader
evidence. Do not report it as checked.
:::

## What you need

| | Windows | macOS |
| --- | --- | --- |
| Screen reader | NVDA (current release) and Narrator | VoiceOver |
| Start and stop | NVDA: Ctrl+Alt+N. Narrator: Win+Ctrl+Enter | Cmd+F5 |
| ZPLC | The installer build under test, not the dev server | The installer build under test |
| Project | The **Blinky** example copied to an empty folder | The same |
| Device | None: use **Simulate**. A board is not needed for this check | None |

Use the same example and the same steps on both systems. Run it once per screen
reader: NVDA and Narrator on Windows, VoiceOver on macOS. Close other
applications that speak or play sound.

## How ZPLC speaks

ZPLC has two live regions, mounted once for the window and present before the
first message (`packages/zplc-ide/src/ui/LiveRegions.tsx`):

- a **polite** status region, for results: a build finished, a connection, run and
  stop, a variable forced or released, a lesson restored;
- an **assertive** alert region, for faults: a build or a deploy that failed, and a
  force that is no longer confirmed.

Messages come from `announce()` in `packages/zplc-ide/src/utils/announce.ts` and
from the notification store, which says the title and the detail of each
notification, assertively when it is an error. If two messages of the same
politeness arrive before the first is read, the last one wins; if you notice a
lost message, write down which two and when. That is the evidence that decides
whether a queue is needed.

Every dialog must move focus into itself when it opens, keep it inside while it is
open, and return it to the control that opened it when it closes. Check this at
each dialog below.

## The script

For each step, do the action, listen, and write down in the table what you heard
and whether it matches. A step passes only when a person who cannot see the screen
could have done it and known its result.

### 1. Open

1. Start ZPLC. Listen for the window title and where focus lands.
2. Move through the welcome screen with Tab. Each button (**Open project**,
   **New project**, **Learn**, an example) must be announced with its name and role.
3. Activate **Examples**, **Blinky** and choose an empty folder.

Listen for: the name of every control as you reach it, never "button" alone or
"unlabelled". After the project opens, focus is inside the workbench.

### 2. Edit

1. Open the program file from the file tree. Listen for the file name and that it
   is an editor.
2. Change a number in the code and save with Ctrl+S (Cmd+S on macOS).

Listen for: the editor announced as a text area you can type in, and the tab as
selected. ZPLC does not announce a plain save, so record how you could tell that
the file was saved, or that you could not.

### 3. Build

1. Run **Build**, **Compile** (Ctrl+B, Cmd+B on macOS).
2. Open **Problems** and **Output** in the bottom panel.

Listen for: the polite status "Build succeeded" (or "Build failed" in the alert
region if you broke the code on purpose), and in **Problems** each diagnostic read
with its file, line and message.

### 4. Simulate

1. In the toolbar choose **Simulate** and press **Connect**.
2. Press **Run** (F5).

Listen for: "Simulator ready", then "Execution started". Both come from the toolbar
messages and are polite. Listen for the state of the status bar changing to running.

### 5. Watch

1. Open **Watch**, press **+** and type `LED_Output`.
2. Wait a few seconds.

Listen for: the new row announced with its name and value, and the value changing
between TRUE and FALSE. The table does not announce every change on its own, so
move to the row and read it twice a second apart. Record whether you can tell that
the value is changing.

### 6. Force

1. In **Watch**, mark **Force** on `LED_Output` and set a value.
2. Release it. Then force it again and use the release-all command.

Listen for: "Forced LED_Output", then "Force released on LED_Output", and when
several are released together "All forces released". If the connection is lost
while a force is active, the alert region says "A force is unconfirmed: verify and
reconnect before operating". You can reach that last message only by stopping the
simulator while a force is active; do it once.

### 7. Deploy dialog

The deploy dialog is shown for a device, not for the simulator. Without a board you
cannot open it, so this step stays **not run** in a check on a bench without
hardware. Record that, and do not mark it as passed. If a board is connected by a
person at the bench:

1. Choose **Deploy**.
2. Listen for the title "Deploy to the device?", the description (it says that
   deploy leaves the PLC stopped and that Run is a separate action), and the
   comparison table with its caption and column headers.
3. Close the dialog with Escape.

Listen for: focus moves into the dialog on open, stays inside it with Tab, and
returns to the **Deploy** button on close.

### 8. One Learn lesson

1. From the welcome screen choose **Learn** and then **Start** on the first lesson.
2. Read the lesson, make the edit it asks for, run the check.
3. Use the reset action once.

Listen for: the lesson panel read in order, the result of the check, and after the
reset the message "The starter was restored.". Listen for the lesson's text
equivalent of any plant picture: a change of situation must be said, not only shown.

## Results

Copy this table into the release checklist, one row per screen reader and step.
Write what you heard in your own words. Mark a step **Pass**, **Fail**, or **Not
run**, and say why for the last two.

| Date | Tester | Screen reader and version | System | ZPLC version | Step | Heard | Focus correct | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | 1 Open | | | | |
| | | | | | 2 Edit | | | | |
| | | | | | 3 Build | | | | |
| | | | | | 4 Simulate | | | | |
| | | | | | 5 Watch | | | | |
| | | | | | 6 Force | | | | |
| | | | | | 7 Deploy dialog | | | | |
| | | | | | 8 Learn lesson | | | | |

A failed step is a defect: file it with the step number, what you heard and what
you expected. The release does not claim screen reader support until every row of
both systems is **Pass**, or a **Not run** row is explained in the release notes.

## See also

- [Keyboard reference for the visual editors](../reference/visual-editor-keyboard.md)
- [ZPLC workbench](../ide/features.md)
- [Hardware in the loop](./hardware-in-the-loop.md)
