---
title: "Function block reference"
sidebar_label: "Function blocks"
description: "Every function block of the ZPLC compiler registry: pin table, behaviour and an example that CI runs."
tags: [reference, generated]
---

# Function block reference

{/* >>> GENERATED (tools/docs/generate_function_reference.ts): reference/function-blocks. Do not edit. >>> */}

Every function block of the compiler registry, with its pin table and an example. The registry has 34 blocks. A block is declared as a variable (`Delay : TON;`) and called with its inputs (`Delay(IN := Start, PT := T#2s);`); its outputs are read as members (`Delay.Q`). A new instance starts with every pin at the zero of its type, as the Initial column says. The functions without state are in the [function reference](./functions.md).

Every example is a complete program. CI compiles it and runs it on the native POSIX runtime, and the result stated under it is the value that the run checks.

## Timers

### TON

On-delay timer: Q goes TRUE after IN has stayed TRUE for PT, and goes FALSE as soon as IN does.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `BOOL` | `FALSE` | Input: the delay runs while it is TRUE. |
| `PT` | Input | `TIME` | `T#0ms` | Preset time. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE once IN has been TRUE for PT. |
| `ET` | Output | `TIME` | `T#0ms` | Time elapsed since IN rose; it stops at PT and is 0 while IN is FALSE. |

```pascal runnable expect="Done=TRUE Elapsed=100" scans=15
PROGRAM Example
VAR
    Delay : TON;
    Done : BOOL;
    Elapsed : UDINT;
END_VAR

Delay(IN := TRUE, PT := T#100ms);
Done := Delay.Q;
Elapsed := TIME_TO_UDINT(Delay.ET);
END_PROGRAM
```

Result after 15 scans of 10 ms: `Done` = `TRUE`, `Elapsed` = `100`.

### TOF

Off-delay timer: Q goes TRUE with IN and goes FALSE PT after IN has fallen.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `BOOL` | `FALSE` | Input: Q follows it up at once and holds PT after it falls. |
| `PT` | Input | `TIME` | `T#0ms` | Preset time. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE while IN is TRUE and for PT after IN falls. |
| `ET` | Output | `TIME` | `T#0ms` | Time elapsed since IN fell; it stops at PT and is 0 while IN is TRUE. |

```pascal runnable expect="Hold=TRUE" scans=8
PROGRAM Example
VAR
    Delay : TOF;
    Scan : INT;
    Hold : BOOL;
END_VAR

Scan := Scan + 1;
Delay(IN := Scan < 3, PT := T#100ms);
Hold := Delay.Q;
END_PROGRAM
```

Result after 8 scans of 10 ms: `Hold` = `TRUE`.

### TP

Pulse timer: a rising edge of IN gives a pulse of exactly PT that IN cannot retrigger or cut short.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `BOOL` | `FALSE` | Input: a rising edge starts the pulse. |
| `PT` | Input | `TIME` | `T#0ms` | Preset time. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE for exactly PT after a rising edge of IN. |
| `ET` | Output | `TIME` | `T#0ms` | Time elapsed since the pulse started; it stops at PT. |

```pascal runnable expect="Out=FALSE" scans=20
PROGRAM Example
VAR
    Shot : TP;
    Out : BOOL;
END_VAR

Shot(IN := TRUE, PT := T#100ms);
Out := Shot.Q;
END_PROGRAM
```

Result after 20 scans of 10 ms: `Out` = `FALSE`.

## Counters

### CTU

Up counter: counts the rising edges of CU.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `CU` | Input | `BOOL` | `FALSE` | Count-up input: a rising edge adds 1. |
| `R` | Input | `BOOL` | `FALSE` | Reset: while TRUE, CV is 0 and nothing is counted. |
| `PV` | Input | `INT` | `0` | Preset value. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE when CV is PV or more. |
| `CV` | Output | `INT` | `0` | Current value; it stops at 32767. |

```pascal runnable expect="Count=3 Reached=TRUE" scans=6
PROGRAM Example
VAR
    Counter : CTU;
    Scan : INT;
    Pulse : BOOL;
    Count : INT;
    Reached : BOOL;
END_VAR

Scan := Scan + 1;
Pulse := (Scan MOD 2) = 0;
Counter(CU := Pulse, R := FALSE, PV := 3);
Count := Counter.CV;
Reached := Counter.Q;
END_PROGRAM
```

Result after 6 scans of 10 ms: `Count` = `3`, `Reached` = `TRUE`.

### CTD

Down counter: counts the rising edges of CD down from the preset loaded by LD.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `CD` | Input | `BOOL` | `FALSE` | Count-down input: a rising edge subtracts 1. |
| `LD` | Input | `BOOL` | `FALSE` | Load: while TRUE, CV is PV and nothing is counted. |
| `PV` | Input | `INT` | `0` | Preset value. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE when CV is 0 or less. |
| `CV` | Output | `INT` | `0` | Current value; it stops at -32768. |

```pascal runnable expect="Count=0 Empty=TRUE" scans=7
PROGRAM Example
VAR
    Counter : CTD;
    Scan : INT;
    Pulse : BOOL;
    Count : INT;
    Empty : BOOL;
END_VAR

Scan := Scan + 1;
Pulse := (Scan MOD 2) = 0;
Counter(CD := Pulse, LD := Scan = 1, PV := 3);
Count := Counter.CV;
Empty := Counter.Q;
END_PROGRAM
```

Result after 7 scans of 10 ms: `Count` = `0`, `Empty` = `TRUE`.

### CTUD

Up and down counter: adds on the rising edges of CU and subtracts on those of CD.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `CU` | Input | `BOOL` | `FALSE` | Count-up input: a rising edge adds 1. |
| `CD` | Input | `BOOL` | `FALSE` | Count-down input: a rising edge subtracts 1. |
| `R` | Input | `BOOL` | `FALSE` | Reset: while TRUE, CV is 0; it wins over LD. |
| `LD` | Input | `BOOL` | `FALSE` | Load: while TRUE and R is FALSE, CV is PV. |
| `PV` | Input | `INT` | `0` | Preset value. |
| `QU` | Output | `BOOL` | `FALSE` | TRUE when CV is PV or more. |
| `QD` | Output | `BOOL` | `FALSE` | TRUE when CV is 0 or less. |
| `CV` | Output | `INT` | `0` | Current value; it stops at 32767 and at -32768. |

```pascal runnable expect="Count=3 High=TRUE" scans=6
PROGRAM Example
VAR
    Counter : CTUD;
    Scan : INT;
    Up : BOOL;
    Count : INT;
    High : BOOL;
END_VAR

Scan := Scan + 1;
Up := (Scan MOD 2) = 0;
Counter(CU := Up, CD := FALSE, R := FALSE, LD := FALSE, PV := 2);
Count := Counter.CV;
High := Counter.QU;
END_PROGRAM
```

Result after 6 scans of 10 ms: `Count` = `3`, `High` = `TRUE`.

## Bistables and edge detectors

### R_TRIG

Rising-edge detector.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `CLK` | Input | `BOOL` | `FALSE` | Signal to watch. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE for one call when CLK goes from FALSE to TRUE. |

```pascal runnable expect="Seen=1" scans=8
PROGRAM Example
VAR
    Edge : R_TRIG;
    Scan : INT;
    Seen : INT;
END_VAR

Scan := Scan + 1;
Edge(CLK := Scan >= 3);
IF Edge.Q THEN
    Seen := Seen + 1;
END_IF;
END_PROGRAM
```

Result after 8 scans of 10 ms: `Seen` = `1`.

### F_TRIG

Falling-edge detector.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `CLK` | Input | `BOOL` | `FALSE` | Signal to watch. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE for one call when CLK goes from TRUE to FALSE. |

```pascal runnable expect="Seen=1" scans=8
PROGRAM Example
VAR
    Edge : F_TRIG;
    Scan : INT;
    Seen : INT;
END_VAR

Scan := Scan + 1;
Edge(CLK := Scan < 3);
IF Edge.Q THEN
    Seen := Seen + 1;
END_IF;
END_PROGRAM
```

Result after 8 scans of 10 ms: `Seen` = `1`.

### RS

Bistable with a dominant reset: when S and R1 are both TRUE, Q1 is FALSE.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `S` | Input | `BOOL` | `FALSE` | Set. |
| `R1` | Input | `BOOL` | `FALSE` | Reset, dominant. |
| `Q1` | Output | `BOOL` | `FALSE` | The stored value. |

```pascal runnable expect="Out=FALSE"
PROGRAM Example
VAR
    Latch : RS;
    Out : BOOL;
END_VAR

Latch(S := TRUE, R1 := TRUE);
Out := Latch.Q1;
END_PROGRAM
```

Result after one scan: `Out` = `FALSE`.

### SR

Bistable with a dominant set: when S1 and R are both TRUE, Q1 is TRUE.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `S1` | Input | `BOOL` | `FALSE` | Set, dominant. |
| `R` | Input | `BOOL` | `FALSE` | Reset. |
| `Q1` | Output | `BOOL` | `FALSE` | The stored value. |

```pascal runnable expect="Out=TRUE"
PROGRAM Example
VAR
    Latch : SR;
    Out : BOOL;
END_VAR

Latch(S1 := TRUE, R := TRUE);
Out := Latch.Q1;
END_PROGRAM
```

Result after one scan: `Out` = `TRUE`.

## Pulse generators

### BLINK

Asymmetric pulse train: Q is TRUE for T_ON and FALSE for T_OFF, over and over, while ENABLE is TRUE.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `ENABLE` | Input | `BOOL` | `FALSE` | While TRUE the output blinks; when it falls, Q is FALSE at once. |
| `T_ON` | Input | `TIME` | `T#0ms` | Duration of the TRUE phase. |
| `T_OFF` | Input | `TIME` | `T#0ms` | Duration of the FALSE phase. |
| `Q` | Output | `BOOL` | `FALSE` | The blinking output; it starts with the TRUE phase. |

```pascal runnable expect="Out=FALSE" scans=13
PROGRAM Example
VAR
    Flasher : BLINK;
    Out : BOOL;
END_VAR

Flasher(ENABLE := TRUE, T_ON := T#100ms, T_OFF := T#100ms);
Out := Flasher.Q;
END_PROGRAM
```

Result after 13 scans of 10 ms: `Out` = `FALSE`.

### PWM

Pulse-width modulation: Q is TRUE for PERIOD * DUTY at the start of every PERIOD.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `ENABLE` | Input | `BOOL` | `FALSE` | While TRUE the output is modulated. |
| `PERIOD` | Input | `TIME` | `T#0ms` | Length of one cycle. |
| `DUTY` | Input | `REAL` | `0.0` | Fraction of the cycle that Q is TRUE, 0.0 to 1.0. |
| `Q` | Output | `BOOL` | `FALSE` | The modulated output; TRUE at the start of each cycle. |

```pascal runnable expect="Out=FALSE" scans=70
PROGRAM Example
VAR
    Modulator : PWM;
    Out : BOOL;
END_VAR

Modulator(ENABLE := TRUE, PERIOD := T#1000ms, DUTY := 0.5);
Out := Modulator.Q;
END_PROGRAM
```

Result after 70 scans of 10 ms: `Out` = `FALSE`.

### PULSE

Single pulse: one pulse of PT for each rising edge of TRIG.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `TRIG` | Input | `BOOL` | `FALSE` | A rising edge starts the pulse; a trigger during the pulse is ignored. |
| `PT` | Input | `TIME` | `T#0ms` | Duration of the pulse. |
| `Q` | Output | `BOOL` | `FALSE` | TRUE while the pulse runs. |

```pascal runnable expect="Out=TRUE" scans=3
PROGRAM Example
VAR
    Shot : PULSE;
    Out : BOOL;
END_VAR

Shot(TRIG := TRUE, PT := T#100ms);
Out := Shot.Q;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Out` = `TRUE`.

## Process control

### HYSTERESIS

Hysteresis comparator: Q goes TRUE above HIGH and FALSE below LOW, and keeps its value in between.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The measured value. |
| `HIGH` | Input | `REAL` | `0.0` | Q goes TRUE when IN rises above this. |
| `LOW` | Input | `REAL` | `0.0` | Q goes FALSE when IN falls below this. |
| `Q` | Output | `BOOL` | `FALSE` | The switched output. |

```pascal runnable expect="Out=TRUE"
PROGRAM Example
VAR
    Switch : HYSTERESIS;
    Out : BOOL;
END_VAR

Switch(IN := 80.0, HIGH := 75.0, LOW := 65.0);
Out := Switch.Q;
END_PROGRAM
```

Result after one scan: `Out` = `TRUE`.

### DEADBAND

Deadband: ignores changes of IN smaller than WIDTH.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The input value. |
| `WIDTH` | Input | `REAL` | `0.0` | Half-width of the band around the last output. |
| `OUT` | Output | `REAL` | `0.0` | The output: it follows IN only when IN leaves the band. |

```pascal runnable expect="Result=10"
PROGRAM Example
VAR
    Filter : DEADBAND;
    Result : REAL;
END_VAR

Filter(IN := 10.0, WIDTH := 1.0);
Result := Filter.OUT;
END_PROGRAM
```

Result after one scan: `Result` = `10`.

### LAG_FILTER

First-order lag filter: OUT := OUT + GAIN * (IN - OUT) on every call.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The input value. |
| `GAIN` | Input | `REAL` | `0.0` | Fraction of the difference taken on each call, 0.0 to 1.0. |
| `OUT` | Output | `REAL` | `0.0` | The filtered value. |

```pascal runnable expect="Result=50"
PROGRAM Example
VAR
    Filter : LAG_FILTER;
    Result : REAL;
END_VAR

Filter(IN := 100.0, GAIN := 0.5);
Result := Filter.OUT;
END_PROGRAM
```

Result after one scan: `Result` = `50`.

### RAMP_REAL

Rate limiter: OUT moves toward IN by at most RATE on every call.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The target value. |
| `RATE` | Input | `REAL` | `0.0` | Largest change of OUT per call. |
| `OUT` | Output | `REAL` | `0.0` | The ramped value. |

```pascal runnable expect="Result=2"
PROGRAM Example
VAR
    Ramp : RAMP_REAL;
    Result : REAL;
END_VAR

Ramp(IN := 10.0, RATE := 2.0);
Result := Ramp.OUT;
END_PROGRAM
```

Result after one scan: `Result` = `2`.

### INTEGRAL

Discrete integrator: OUT := OUT + IN * DT on every call.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The rate to integrate. |
| `DT` | Input | `REAL` | `0.0` | Time step of a call, in seconds. |
| `RESET` | Input | `BOOL` | `FALSE` | While TRUE, OUT is 0. |
| `OUT` | Output | `REAL` | `0.0` | The accumulated value. |

```pascal runnable expect="Result=1"
PROGRAM Example
VAR
    Integrator : INTEGRAL;
    Result : REAL;
END_VAR

Integrator(IN := 2.0, DT := 0.5, RESET := FALSE);
Result := Integrator.OUT;
END_PROGRAM
```

Result after one scan: `Result` = `1`.

### DERIVATIVE

Discrete differentiator: OUT := (IN - previous IN) / DT.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `IN` | Input | `REAL` | `0.0` | The input value. |
| `DT` | Input | `REAL` | `0.0` | Time step of a call, in seconds; with 0 the output is 0. |
| `OUT` | Output | `REAL` | `0.0` | The rate of change per second. |

```pascal runnable expect="Result=2" scans=3
PROGRAM Example
VAR
    Slope : DERIVATIVE;
    Scan : INT;
    Value : REAL;
    Result : REAL;
END_VAR

Scan := Scan + 1;
Value := INT_TO_REAL(Scan) * 4.0;
Slope(IN := Value, DT := 2.0);
Result := Slope.OUT;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Result` = `2`.

### PID_Compact

PID controller: OUT is KP * error + KI * integral of error + KD * change of error per second, limited to OUT_MIN and OUT_MAX. The integral is not clamped: it keeps accumulating while OUT sits at a limit, so there is no anti-windup.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `SP` | Input | `REAL` | `0.0` | Setpoint. |
| `PV` | Input | `REAL` | `0.0` | Process variable. |
| `KP` | Input | `REAL` | `0.0` | Proportional gain. |
| `KI` | Input | `REAL` | `0.0` | Integral gain. |
| `KD` | Input | `REAL` | `0.0` | Derivative gain. |
| `DT` | Input | `REAL` | `0.0` | Sample time of a call, in seconds; with 0 there is no derivative term. |
| `OUT_MIN` | Input | `REAL` | `0.0` | Lower limit of OUT. |
| `OUT_MAX` | Input | `REAL` | `0.0` | Upper limit of OUT. |
| `OUT` | Output | `REAL` | `0.0` | The controller output. |

```pascal runnable expect="Result=20"
PROGRAM Example
VAR
    Loop : PID_Compact;
    Result : REAL;
END_VAR

Loop(SP := 100.0, PV := 90.0, KP := 2.0, KI := 0.0, KD := 0.0, DT := 0.1, OUT_MIN := 0.0, OUT_MAX := 100.0);
Result := Loop.OUT;
END_PROGRAM
```

Result after one scan: `Result` = `20`.

## Buffers

### FIFO

First in, first out buffer of up to eight DINT values.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `PUSH` | Input | `BOOL` | `FALSE` | A rising edge stores DATA_IN. |
| `POP` | Input | `BOOL` | `FALSE` | A rising edge removes the oldest value into DATA_OUT. |
| `RST` | Input | `BOOL` | `FALSE` | Empties the buffer. |
| `DATA_IN` | Input | `DINT` | `0` | The value to store. |
| `SIZE` | Input | `DINT` | `0, read as 8` | Capacity, 1 to 8; a value outside that range is read as 8. |
| `EMPTY` | Output | `BOOL` | `FALSE` | TRUE when the buffer holds no value. |
| `FULL` | Output | `BOOL` | `FALSE` | TRUE when the buffer holds SIZE values. |
| `DATA_OUT` | Output | `DINT` | `0` | The last value removed. |
| `COUNT` | Output | `DINT` | `0` | Number of values stored. |

```pascal runnable expect="First=10 Items=1" scans=6
PROGRAM Example
VAR
    Queue : FIFO;
    Scan : INT;
    First : DINT;
    Items : DINT;
END_VAR

Scan := Scan + 1;
Queue(PUSH := (Scan = 1) OR (Scan = 3), POP := Scan = 5, DATA_IN := Scan * 10);
First := Queue.DATA_OUT;
Items := Queue.COUNT;
END_PROGRAM
```

Result after 6 scans of 10 ms: `First` = `10`, `Items` = `1`.

### LIFO

Last in, first out buffer (a stack) of up to eight DINT values.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `PUSH` | Input | `BOOL` | `FALSE` | A rising edge stores DATA_IN. |
| `POP` | Input | `BOOL` | `FALSE` | A rising edge removes the newest value into DATA_OUT. |
| `RST` | Input | `BOOL` | `FALSE` | Empties the buffer. |
| `DATA_IN` | Input | `DINT` | `0` | The value to store. |
| `SIZE` | Input | `DINT` | `0, read as 8` | Capacity, 1 to 8; a value outside that range is read as 8. |
| `EMPTY` | Output | `BOOL` | `FALSE` | TRUE when the buffer holds no value. |
| `FULL` | Output | `BOOL` | `FALSE` | TRUE when the buffer holds SIZE values. |
| `DATA_OUT` | Output | `DINT` | `0` | The last value removed. |
| `COUNT` | Output | `DINT` | `0` | Number of values stored. |

```pascal runnable expect="Top=30 Items=1" scans=6
PROGRAM Example
VAR
    Stack : LIFO;
    Scan : INT;
    Top : DINT;
    Items : DINT;
END_VAR

Scan := Scan + 1;
Stack(PUSH := (Scan = 1) OR (Scan = 3), POP := Scan = 5, DATA_IN := Scan * 10);
Top := Stack.DATA_OUT;
Items := Stack.COUNT;
END_PROGRAM
```

Result after 6 scans of 10 ms: `Top` = `30`, `Items` = `1`.

## Modbus

The examples of these blocks run on the native host runtime, which has no Modbus server, MQTT broker or cloud service to talk to: each block ends with `ERROR` TRUE and `STATUS` 3 (no handler). They prove that the block compiles, runs and reports its status; the exchange with a peer is verified separately, against protocol doubles.

### MB_READ_HREG

Reads holding registers from a Modbus server.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `PROTO` | Input | `USINT` | `0` | Transport: 0 for RTU, 1 for TCP. |
| `SLAVE_ID` | Input | `UINT` | `0` | Modbus unit identifier of the server. |
| `ADDR` | Input | `UINT` | `0` | First address to read or write. |
| `COUNT` | Input | `UINT` | `0` | Number of items requested. |
| `HOST` | Input | `STRING` | `''` | Host name or address of the server, for TCP. |
| `PORT` | Input | `UINT` | `0` | TCP port of the server. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `VALUE` | Output | `UINT` | `0` | The first register read. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_READ_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_WRITE_HREG

Writes holding registers of a Modbus server.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `PROTO` | Input | `USINT` | `0` | Transport: 0 for RTU, 1 for TCP. |
| `SLAVE_ID` | Input | `UINT` | `0` | Modbus unit identifier of the server. |
| `ADDR` | Input | `UINT` | `0` | First address to read or write. |
| `COUNT` | Input | `UINT` | `0` | Number of items requested. |
| `VALUE` | Input | `UINT` | `0` | The first register to write. |
| `HOST` | Input | `STRING` | `''` | Host name or address of the server, for TCP. |
| `PORT` | Input | `UINT` | `0` | TCP port of the server. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_WRITE_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, VALUE := 100, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_READ_COIL

Reads coils from a Modbus server.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `PROTO` | Input | `USINT` | `0` | Transport: 0 for RTU, 1 for TCP. |
| `SLAVE_ID` | Input | `UINT` | `0` | Modbus unit identifier of the server. |
| `ADDR` | Input | `UINT` | `0` | First address to read or write. |
| `COUNT` | Input | `UINT` | `0` | Number of items requested. |
| `HOST` | Input | `STRING` | `''` | Host name or address of the server, for TCP. |
| `PORT` | Input | `UINT` | `0` | TCP port of the server. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `VALUE` | Output | `BOOL` | `FALSE` | The first coil read. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_READ_COIL;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MB_WRITE_COIL

Writes coils of a Modbus server.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `PROTO` | Input | `USINT` | `0` | Transport: 0 for RTU, 1 for TCP. |
| `SLAVE_ID` | Input | `UINT` | `0` | Modbus unit identifier of the server. |
| `ADDR` | Input | `UINT` | `0` | First address to read or write. |
| `COUNT` | Input | `UINT` | `0` | Number of items requested. |
| `VALUE` | Input | `BOOL` | `FALSE` | The first coil to write. |
| `HOST` | Input | `STRING` | `''` | Host name or address of the server, for TCP. |
| `PORT` | Input | `UINT` | `0` | TCP port of the server. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MB_WRITE_COIL;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, VALUE := TRUE, HOST := '127.0.0.1', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

## MQTT

The examples of these blocks run on the native host runtime, which has no Modbus server, MQTT broker or cloud service to talk to: each block ends with `ERROR` TRUE and `STATUS` 3 (no handler). They prove that the block compiles, runs and reports its status; the exchange with a peer is verified separately, against protocol doubles.

### MQTT_CONNECT

Reports the state of the MQTT session that the device configuration opens; it does not open the session itself.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `PROFILE` | Input | `USINT` | `0` | Connection profile selector. The session is the one that the device configuration defines; this pin does not change it. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `CONNECTED` | Output | `BOOL` | `FALSE` | TRUE while the broker session is open. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_CONNECT;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROFILE := 0);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MQTT_PUBLISH

Publishes one message to a topic.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `QOS` | Input | `USINT` | `0` | Quality of service: 0, 1 or 2. |
| `RETAIN` | Input | `BOOL` | `FALSE` | Ask the broker to retain the message. |
| `TOPIC` | Input | `STRING` | `''` | Topic to publish to. |
| `PAYLOAD` | Input | `STRING` | `''` | Message to publish. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_PUBLISH;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, QOS := 0, RETAIN := FALSE, TOPIC := 'plant/a', PAYLOAD := '1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### MQTT_SUBSCRIBE

Subscribes to a topic and delivers its messages.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `QOS` | Input | `USINT` | `0` | Quality of service: 0, 1 or 2. |
| `TOPIC` | Input | `STRING` | `''` | Topic to subscribe to. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `VALID` | Output | `BOOL` | `FALSE` | TRUE when PAYLOAD holds a new message. |
| `PAYLOAD` | Output | `STRING` | `''` | The last message received. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : MQTT_SUBSCRIBE;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, QOS := 0, TOPIC := 'plant/cmd');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

## Cloud and Sparkplug B

The examples of these blocks run on the native host runtime, which has no Modbus server, MQTT broker or cloud service to talk to: each block ends with `ERROR` TRUE and `STATUS` 3 (no handler). They prove that the block compiles, runs and reports its status; the exchange with a peer is verified separately, against protocol doubles.

### AZURE_C2D_RECV

Receives a cloud-to-device message of Azure IoT Hub.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `PAYLOAD` | Output | `STRING` | `''` | The cloud-to-device message received. |
| `VALID` | Output | `BOOL` | `FALSE` | TRUE when PAYLOAD holds a new message. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_C2D_RECV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AZURE_DPS_PROV

Registers the device with the Azure Device Provisioning Service.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `DEVICE_ID` | Input | `STRING` | `''` | Registration identifier of the device. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `ASSIGNED_HUB` | Output | `STRING` | `''` | The hub that the service assigned. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_DPS_PROV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, DEVICE_ID := 'device-1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AZURE_EG_PUB

Publishes an event to an Azure Event Grid topic.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `TOPIC` | Input | `STRING` | `''` | Event Grid topic to publish to. |
| `EVENT_TYPE` | Input | `STRING` | `''` | Type of the event. |
| `PAYLOAD` | Input | `STRING` | `''` | Body of the event. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AZURE_EG_PUB;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, TOPIC := 'plant', EVENT_TYPE := 'alarm', PAYLOAD := '1');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### AWS_FLEET_PROV

Provisions the device through AWS IoT fleet provisioning.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `TEMPLATE_NAME` | Input | `STRING` | `''` | Name of the fleet provisioning template. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |
| `THING_NAME` | Output | `STRING` | `''` | The name of the thing that the service created. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : AWS_FLEET_PROV;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, TEMPLATE_NAME := 'plant');
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

### SPB_REBIRTH

Asks the Sparkplug B session to publish its birth certificates again.

| Pin | Direction | Type | Initial | Description |
| --- | --- | --- | --- | --- |
| `EN` | Input | `BOOL` | `FALSE` | Enable: the block runs while it is TRUE. |
| `BUSY` | Output | `BOOL` | `FALSE` | TRUE while a request is in progress. |
| `DONE` | Output | `BOOL` | `FALSE` | TRUE when the request has finished without error. |
| `ERROR` | Output | `BOOL` | `FALSE` | TRUE when the request failed; STATUS says why. |
| `STATUS` | Output | `DINT` | `0` | Status code: 0 OK, 1 busy, 2 timeout, 3 no handler, 4 not connected, 5 queue full, 6 invalid address, 7 string overflow, 8 protocol error, 9 authentication failed. |

```pascal runnable expect="Failed=TRUE Code=3" scans=3
PROGRAM Example
VAR
    Link : SPB_REBIRTH;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

Result after 3 scans of 10 ms: `Failed` = `TRUE`, `Code` = `3`.

{/* <<< END GENERATED: reference/function-blocks <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
