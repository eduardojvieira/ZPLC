## The machine

This station is a continuous level-control tank: instead of on/off level switches and fixed valves, a level transmitter reports the liquid height as a raw integer, and proportional valves open to any percentage from 0 to 100 %. Two potentiometers on the operator panel set the target level and a manual drain disturbance, a numeric display shows the level in metres, and a green lamp indicates when the level is on target.

![The tank-level-control scene seen from the front. A tall clear tank on four feet stands in the centre with proportional inlet and outlet valves. To the left, two potentiometers on pedestals provide the SetPoint and DrainPot knobs. To the right stand a three-lamp stack light and a digital numeric display on a pedestal. Callout boxes show each part's name, kind and wired signals.](images/machine.en.png)

The station has five parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part           | Kind            | What it is in a real plant                                                                                                 |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Tank1`        | Tank            | A process tank filled through an inlet valve and emptied through an outlet valve, with instruments that measure its level. |
| `SetPoint`     | Potentiometer   | A knob on the operator panel that sets a value, such as a speed or a setpoint.                                             |
| `DrainPot`     | Potentiometer   | A knob on the operator panel that sets a value, such as a speed or a setpoint.                                             |
| `LevelDisplay` | Numeric display | A small display on the operator panel that shows a number the program sends.                                               |
| `StackLight1`  | Stack light     | A tower of coloured lamps that shows from afar what the machine is doing.                                                  |

| Variable      | Signal               | Direction & type                        | Meaning                                                                |
| ------------- | -------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `LevelRaw`    | `Tank1.level`        | PLC input · INT, 0 to 27648 = 0 to 1 m  | The level of the liquid in the tank.                                   |
| `FillCmd`     | `Tank1.fill`         | PLC output · REAL, 0 to 100 %           | The inlet valve: open or closed (BOOL), or how far it is open (REAL).  |
| `DrainCmd`    | `Tank1.drain`        | PLC output · REAL, 0 to 100 %           | The outlet valve: open or closed (BOOL), or how far it is open (REAL). |
| `SetPointRaw` | `SetPoint.value`     | PLC input · INT, 0 to 1000 = 0 to 1 m   | Where the knob is turned to.                                           |
| `DrainRaw`    | `DrainPot.value`     | PLC input · INT, 0 to 1000 = 0 to 100 % | Where the knob is turned to.                                           |
| `LevelShown`  | `LevelDisplay.value` | PLC output · REAL, 0 to 1 m             | The number to show.                                                    |
| `Green`       | `StackLight1.green`  | PLC output · BOOL                       | TRUE lights the green lamp.                                            |

Notice the raw spans: the tank transmitter reports `0` to `27648` (a common industrial analog-input range) for `0` to `1 m`, while both panel potentiometers report `0` to `1000`. The valves and display expect `REAL` values in percent or metres.

## From raw counts to engineering units

An analog input card turns a voltage or current into a whole number (`INT`). Different devices on the same machine often use different raw spans. If your control logic works directly on raw counts, every formula is tied to the wiring of one card and breaks the moment a sensor is replaced.

Instead, scale every raw input to **engineering units** (`REAL` — metres, degrees, bar, percent) once, at the top of the scan, and write every calculation below in those physical units.

Watch the order of conversion and division:

- In Structured Text, dividing an `INT` by an `INT` uses integer division and drops the fraction. For example, `13824 / 27648` gives `0`, not `0.5`.
- Convert the raw `INT` to `REAL` with `INT_TO_REAL(...)` **first**, then divide by a `REAL` literal (such as `27648.0`) so the fraction is kept.

Once both the target and the measurement are in the same engineering unit, a **proportional** actuator command multiplies the error (`target - measurement`) by a gain. Because a large positive error can exceed 100 % and a negative error (measurement above target) gives a negative number, the program must **clamp** the command to the actuator's valid range (`0.0` to `100.0`) before sending it out.

## Worked example

A heated drying oven reads its temperature from a sensor (`TempRaw`, `0` to `4000` for `0` to `200` °C) and its target from a dial (`TargetRaw`, `0` to `500` for `0` to `200` °C). It drives a proportional heater at `4 %` per degree below the target, limited to `0` to `100 %`, outputs the temperature in °C, and lights `CoolWarn` whenever the oven is more than `10` °C below the target.

```st
PROGRAM OvenHeater
VAR_INPUT
    TempRaw   : INT;
    TargetRaw : INT;
END_VAR
VAR_OUTPUT
    HeaterPct : REAL;
    TempC     : REAL;
    CoolWarn  : BOOL;
END_VAR
VAR
    TargetC : REAL;
    Power   : REAL;
END_VAR

TempC   := INT_TO_REAL(TempRaw) * 200.0 / 4000.0;
TargetC := INT_TO_REAL(TargetRaw) * 200.0 / 500.0;

Power := 4.0 * (TargetC - TempC);
IF Power > 100.0 THEN
    Power := 100.0;
ELSIF Power < 0.0 THEN
    Power := 0.0;
END_IF;

HeaterPct := Power;
CoolWarn  := (TargetC - TempC) > 10.0;
END_PROGRAM
```

Read it from the top. Both raw integers are converted to `REAL` with `INT_TO_REAL` before any multiplication or division, so a raw reading of `1000` becomes `50.0` °C instead of `0`. Once `TempC` and `TargetC` are both in °C, the error `TargetC - TempC` is meaningful even though the sensor and the dial had different raw spans. The `IF` / `ELSIF` block clamps `Power` so the heater never receives less than `0.0 %` or more than `100.0 %`.

This oven has no second valve to scale from an operator knob, and its lamp only warns when the temperature is more than 10 °C below the target. In the practice, you also pass a second potentiometer to the discharge valve in percent, and the green lamp must stay lit whenever the level is within 5 percent of the set point on either side.

## Common mistakes

- Dividing two `INT` values before calling `INT_TO_REAL`. Writing `INT_TO_REAL(Raw / 27648)` performs integer division first, produces `0` for every level below full, and leaves the inlet valve wide open until the tank spills.
- Comparing raw counts directly. `LevelRaw` uses a span of `27648` while `SetPointRaw` uses `1000`; comparing them without scaling puts the two signals on completely different scales.
- Forgetting to clamp the proportional command. When the level rises above the set point, the error is negative; when it is far below, the product exceeds `100.0`.
- Checking only one side of the tolerance band or using a fixed metre offset instead of 5 percent of the set point.

> [!NOTE]
> A proportional controller has no memory: when the drain opens, the level settles slightly below the set point so the small remaining error keeps the inlet open enough to match the outflow. The next lesson adds integral and derivative terms (`PID_Compact`) to eliminate that steady-state offset.

## Check yourself

```quiz
question: What does INT_TO_REAL(13824 / 27648) evaluate to in Structured Text?
options:
  - { text: '0.0, because the integer division runs first and drops the fraction before the conversion', correct: true, feedback: 'Yes. Convert to REAL before dividing so the fractional part is kept.' }
  - { text: '0.5, because INT_TO_REAL turns both operands into REAL before dividing', feedback: 'INT_TO_REAL converts only the result of the expression inside its parentheses, which is already 0.' }
  - { text: '1.0, because integer division rounds 0.5 up to the nearest whole number', feedback: 'Integer division truncates toward zero, so 13824 / 27648 is 0.' }
```

```quiz
question: In the drying oven of the worked example, TargetC is 150.0 °C and TempC is 160.0 °C. What is HeaterPct?
options:
  - { text: '0.0, because the negative power command is clamped at the lower limit', correct: true, feedback: 'Right. 4.0 * (150.0 - 160.0) is -40.0, and the ELSIF branch limits it to 0.0.' }
  - { text: '-40.0, because the oven is 10 °C above target', feedback: 'The ELSIF Power < 0.0 branch clamps negative values to 0.0 before assigning HeaterPct.' }
  - { text: '40.0, because the heater always drives the absolute value of the error', feedback: 'The formula uses TargetC - TempC without ABS, so an over-temperature oven turns the heater off.' }
```

## What you will do in the practice

The starting program in `src/TankLevel.st` declares the three `INT` inputs (`LevelRaw`, `SetPointRaw`, `DrainRaw`) and four outputs (`FillCmd`, `DrainCmd`, `LevelShown`, `Green`), and drives nothing yet. You will scale the level and set point to metres, drive `FillCmd` proportionally at 800 percent per metre of error limited to 0 to 100 percent, pass `DrainRaw` to `DrainCmd` in percent, show the level on `LevelShown`, and light `Green` while the level is within 5 percent of the set point. The scenario raises the set point to 0.5 m at {{t:200}} ms and opens the drain potentiometer to 40 percent at {{t:40000}} ms. Save your program and press {{ui:learn.check}}.
