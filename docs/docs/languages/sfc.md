---
description: Build a Sequential Function Chart in the ZPLC editor with steps, transitions and qualified actions, and avoid the common mistakes.
tags: [languages, sfc]
---

# Write a Sequential Function Chart

This guide shows how to build a Sequential Function Chart (SFC) in the ZPLC editor: how steps, transitions and actions fit together, what each action qualifier does, how a scan moves through the chart, and which charts the build refuses. The full list of elements, with the proof behind each one, is the generated [Sequential Function Chart reference](../reference/language-sfc.md).

An SFC file is a model of steps, transitions and actions, not text. The build checks it and translates it to Structured Text, which is read-only output; the compiler then handles it like any other program ([Compiler workflow](../ide/compiler.md)).

## Build a chart

1. Open an SFC file of the project, or create one with **New File**. A new chart starts with one initial step named `Init`.
2. Insert a transition after the selected step, then a step after that transition. Press an element of the palette (Step, Initial step, Transition), drag it onto the canvas, or use the keys: `T` inserts a transition below the selected step and `S` a step below the selected transition, each wired to the one it follows.
3. Press `F2`, or double-click, to name a step and to write the condition of a transition.
4. Define the actions the chart runs. An action has a name and a body written in Structured Text.
5. Associate each action with the steps that run it, and choose a qualifier for each association. `L` and `D` also need a time such as `T#2s`.
6. Build the project (`Ctrl+B`) and read the Problems tab. A problem names the step, transition or action it is about, and activating it selects that element.

Every action also works from the keyboard; the [keyboard reference](../reference/visual-editor-keyboard.md) lists the keys.

## The elements of the palette

| Element      | What it is                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| Initial step | The step that is active when the program starts.                                   |
| Step         | A state of the machine. It can run actions while it is active.                     |
| Transition   | The condition that moves the chart from the steps before it to the steps after it. |

A transition condition is a `BOOL` expression in Structured Text. Inside a condition or an action body, `Step.X` is TRUE while the step named `Step` is active, and `Step.T` is the time the step has been active. A selection divergence is several transitions that leave one step; a simultaneous divergence or convergence is one transition that enters or leaves several steps.

## Action qualifiers

| Qualifier | The action runs                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------- |
| `N`       | while the step is active                                                                        |
| `S`       | from the first scan of the step until some step with `R` resets it, also after the step is left |
| `R`       | no longer once this step is active: it clears the state that `S` stored for the action          |
| `L`       | while the step is active, for at most the time given                                            |
| `D`       | while the step is active, once the time given has passed                                        |
| `P`, `P1` | for one scan, when the step becomes active                                                      |
| `P0`      | for one scan, when the step is left                                                             |

The qualifiers `SD`, `DS` and `SL` are not supported: the build refuses them with a message.

## How a scan moves through the chart

One scan runs in this order, so a sequence crosses at most one transition per scan and every step that became active runs its actions for at least one scan.

1. The time `.T` of each step is updated.
2. The actions run on the state the scan started with.
3. Every transition is evaluated against that same state. Among the transitions that leave one step, the first that holds wins; its order is the priority number if it has one, and the order in the file otherwise.
4. The transitions that fired are applied together: all the steps they leave become inactive, then all the steps they enter become active.

A chart of more than 14 steps builds and runs on the native runtime.

## Common mistakes

| Mistake                                                 | What happens                                                    | What to do                                             |
| ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Two steps with the same name                            | The build refuses it, because `Step.T` would be ambiguous.      | Give every step a distinct name.                       |
| A variable named like a step                            | The build refuses it for the same reason.                       | Rename the variable or the step.                       |
| `L` or `D` with no time                                 | The build says that the qualifier needs a time, such as `T#2s`. | Write a `TIME` literal.                                |
| A time on `N`, `S`, `R` or `P`                          | The build says that the qualifier does not support time.        | Leave the time empty.                                  |
| An action name that does not resolve                    | The build names the step and the action.                        | Define the action, or fix the name.                    |
| An empty transition condition                           | The build refuses it.                                           | Write a `BOOL` expression; `TRUE` always fires.        |
| A transition that does not reference a known step       | The build refuses it and names the transition.                  | Reconnect it to existing steps.                        |
| An action body in a language other than Structured Text | Only Structured Text actions are supported.                     | Write the body in Structured Text.                     |
| A step that no transition enters                        | It has no place for a breakpoint to stop.                       | Set the breakpoint on a step that a transition enters. |

## Watch it run

While a program runs in the simulation, the editor shows which steps are active and for how long, and for each transition whether its condition holds and whether it fired in this scan. A breakpoint on a step stops where a transition enters it, and a breakpoint on a transition stops where it fires; `F9` toggles it on the selected element. A state that the debug map does not give is shown as unavailable, never as idle. See [Text and visual editors](../ide/editors.md) for the details.

Evidence level: host. The conformance cases of the reference run steps, qualifiers, branches and a chart of more than 14 steps on the native runtime, and `packages/zplc-ide/src/transpiler/transpiler.test.ts` covers the translation and its refusals. No board was used.
