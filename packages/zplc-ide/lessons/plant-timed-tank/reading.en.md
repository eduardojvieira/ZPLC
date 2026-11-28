## The machine

This station is a batch process tank: liquid enters through a top inlet valve, waits in the tank, and leaves through a bottom outlet valve. Real plants use timed batch tanks for rinsing, dosing and soaking, where a timer either sets how long a valve stays open or limits how long the program waits for a level switch.

![The timed-tank scene seen from the front. A tall clear tank on four feet stands in the centre, with an inlet valve on the upper left pipe and a drain valve on the lower right pipe. On the left, a control pedestal holds a green start button in front and a red mushroom emergency stop on a yellow base behind it. On the right stands a three-lamp stack light on a post. Callout boxes show each part's name, kind and wired signals.](images/machine.en.png)

The station has four parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind           | What it is in a real plant                                                                                                 |
| ------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Tank1`       | Tank           | A process tank filled through an inlet valve and emptied through an outlet valve, with instruments that measure its level. |
| `StartButton` | Push button    | A button on the operator panel that is pressed only while a finger holds it.                                               |
| `EStop1`      | Emergency stop | The red mushroom button that stops the machine; it stays in until someone twists it to release it.                         |
| `StackLight1` | Stack light    | A tower of coloured lamps that shows from afar what the machine is doing.                                                  |

| Variable    | Signal                | Direction & type  | Meaning                                                                                                      |
| ----------- | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `LevelLow`  | `Tank1.levelLow`      | PLC input · BOOL  | TRUE while the level is at the low mark or below it.                                                         |
| `LevelHigh` | `Tank1.levelHigh`     | PLC input · BOOL  | TRUE while the level is at the high mark or above it.                                                        |
| `Fill`      | `Tank1.fill`          | PLC output · BOOL | The inlet valve: open or closed (BOOL), or how far it is open (REAL).                                        |
| `Drain`     | `Tank1.drain`         | PLC output · BOOL | The outlet valve: open or closed (BOOL), or how far it is open (REAL).                                       |
| `Start`     | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                                                                          |
| `EStopOk`   | `EStop1.ok`           | PLC input · BOOL  | TRUE while the button is released (its normally closed contact); FALSE when it is pushed or its wire is cut. |
| `Green`     | `StackLight1.green`   | PLC output · BOOL | TRUE lights the green lamp.                                                                                  |
| `Amber`     | `StackLight1.amber`   | PLC output · BOOL | TRUE lights the amber lamp.                                                                                  |
| `Red`       | `StackLight1.red`     | PLC output · BOOL | TRUE lights the red lamp.                                                                                    |

Notice `EStopOk`: an emergency stop uses a normally closed contact, so the signal is TRUE while the machine is allowed to run and FALSE when someone pushes the mushroom button or a wire breaks.

## One timer per step, and a timer as a safety limit

A batch cycle moves through numbered steps in order, starting from an idle step (`0`). Each active step drives its own outputs and waits for one exit condition before moving to the next step.

Two kinds of timed steps appear in process plants:

- **A timed step with no sensor.** When there is no sensor at the target level or duration, an on-delay timer (`TON`) measures the step. Its `IN` input is TRUE only while that step is active; when its `.Q` output turns TRUE, the cycle advances.
- **A sensor step with a safety timeout.** When a step normally ends on a sensor — such as a low-level switch — a `TON` runs alongside it with a generous preset. If the sensor never triggers because a valve is blocked or a switch failed, `.Q` ends the step anyway so the machine does not stay stuck forever.

Call every `TON` on every scan, outside any `IF` block, with `IN` tied to its own step. When the cycle leaves that step — either normally or because a stop condition sends the cycle back to idle — `IN` becomes FALSE on the next scan and the timer resets cleanly for the next run.

```timing
span: 8000
signals:
  - { name: CycleBtn, edges: [200, 400, 3000, 3200] }
  - { name: GuardClosed, edges: [0, 1200, 2400, 8000] }
  - { name: WashPump, edges: [200, 1200, 3000, 5000] }
  - { name: AirKnife, edges: [5000, 7000] }
  - { name: FaultLamp, edges: [1200, 2400] }
caption: Opening the guard aborts the first cycle and resets the timers; closing it lets the next press run both steps
```

## Worked example

A parts washer runs a two-step cycle when an operator presses `CycleBtn` while the safety guard is closed (`GuardClosed` is TRUE). First it runs `WashPump` for 4 seconds. Then it runs `AirKnife` until a moisture sensor (`AirDry`) reports the part is dry, or for 10 seconds at most. Opening the guard aborts the cycle immediately, turns off both actuators and lights `FaultLamp`.

```st
PROGRAM PartsWasher
VAR_INPUT
    CycleBtn    : BOOL;
    GuardClosed : BOOL;
    AirDry      : BOOL;
END_VAR
VAR_OUTPUT
    WashPump  : BOOL;
    AirKnife  : BOOL;
    BusyLamp  : BOOL;
    FaultLamp : BOOL;
END_VAR
VAR
    Phase : INT;
    WashT : TON;
    DryT  : TON;
END_VAR

IF NOT GuardClosed THEN
    Phase := 0;
ELSIF Phase = 0 AND CycleBtn THEN
    Phase := 1;
END_IF;

WashT(IN := Phase = 1, PT := T#4s);
IF Phase = 1 AND WashT.Q THEN
    Phase := 2;
END_IF;

DryT(IN := Phase = 2, PT := T#10s);
IF Phase = 2 AND (AirDry OR DryT.Q) THEN
    Phase := 0;
END_IF;

WashPump  := Phase = 1;
AirKnife  := Phase = 2;
BusyLamp  := Phase <> 0;
FaultLamp := NOT GuardClosed;
END_PROGRAM
```

Read it from top to bottom. The safety check comes first: whenever `GuardClosed` is FALSE, `Phase` returns to `0` and the `ELSIF` branch cannot start a new cycle. Both `TON` blocks are called on every scan, so `WashT` runs only in phase 1 and `DryT` runs only in phase 2; as soon as `Phase` changes, the timer of the old phase sees `IN := FALSE` and resets. At the bottom, every output is derived from `Phase` or `GuardClosed` in one place, so two actuators can never stay latched on by mistake.

This washer has only two active steps and no lamp that stays on after a finished cycle. In the practice, the tank adds a hold step between filling and draining, and a green lamp that must stay lit after a completed cycle until a new cycle starts or the emergency stop is pressed.

## Common mistakes

- Calling a `TON` inside an `IF` block for its step. When the cycle leaves the step or aborts on an emergency stop, the timer is no longer called with `IN := FALSE`, so it keeps its old elapsed time and fires immediately on the next cycle.
- Reusing one `TON` for two consecutive timed steps. Because `IN` stays TRUE from the end of one step to the start of the next, the timer never sees a FALSE scan and never resets.
- Inverting the emergency stop logic. `EStopOk` is TRUE while released and FALSE when pressed; stopping on `EStopOk` instead of `NOT EStopOk` locks the machine out during normal operation.
- Leaving the finished-cycle lamp on after an emergency stop or after a new cycle begins. An aborted or newly started cycle is not finished.

> [!NOTE]
> A timed step measures time, not volume. If the supply pressure drops or a valve opens more slowly, the same 3.5 seconds puts less liquid in the tank. That is why real tanks use a level sensor whenever they can, and keep a timer as a backup limit.

## Check yourself

```quiz
question: Why should each TON timer be called on every scan with IN tied to its own step, instead of inside an IF block?
options:
  - { text: 'So that leaving the step or aborting the cycle drives IN to FALSE and resets the timer for the next run', correct: true, feedback: 'Yes. A TON resets only when it is called with IN equal to FALSE.' }
  - { text: 'Because ZPLC does not allow function blocks to be called inside an IF statement', feedback: 'The language allows it, but skipping the call leaves the timer frozen at its last elapsed time.' }
  - { text: 'Because two timers cannot share the same scan cycle', feedback: 'Any number of TON instances can run in the same scan; each keeps its own elapsed time.' }
```

```quiz
question: In the parts washer of the worked example, GuardClosed becomes FALSE while Phase is 2. What happens on that scan?
options:
  - { text: 'Phase becomes 0, DryT sees IN as FALSE and resets, both actuators turn off, and FaultLamp turns on', correct: true, feedback: 'Right. The first IF resets Phase to 0 before the timers and outputs are evaluated.' }
  - { text: 'AirKnife keeps running until DryT reaches 10 seconds, then FaultLamp turns on', feedback: 'The guard check runs at the top of every scan and resets Phase to 0 immediately.' }
  - { text: 'Phase stays at 2 so the cycle can resume once the guard is closed again', feedback: 'The IF sets Phase to 0, so closing the guard leaves the washer idle until CycleBtn is pressed again.' }
```

## What you will do in the practice

The starting program in `src/TimedTank.st` declares the four inputs and five outputs and drives nothing yet. You will write the cycle for the tank: each press of Start while the emergency stop is released and the tank is idle fills for 3.5 seconds, holds for 2 seconds, drains until `LevelLow` or 20 seconds, and lights `Green` when finished, while an emergency stop aborts the cycle and lights `Red`. The scenario presses Start at {{t:200}} ms, triggers the emergency stop at {{t:1000}} ms, releases it and presses Start again at {{t:4000}} ms. Save your program and press {{ui:learn.check}}.
