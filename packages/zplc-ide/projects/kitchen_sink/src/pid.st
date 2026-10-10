(*
 * Kitchen Sink 3/10 - PID controller
 *
 * Block: PID_Compact (48 bytes of instance data, so it gets a program of its
 * own), plus LIMIT on its output.
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsPid
VAR
    SensorInput     : REAL := 50.0;
    AnalogOutput    : REAL := 0.0;
    TempReal        : REAL := 0.0;
    PidController   : PID_Compact;
END_VAR

(* PID_Compact - PID Controller *)
(* KI is KP / TI and KD is KP * TD in the units of the block; DT is the sample time in seconds *)
PidController(
    SP := 50.0,
    PV := SensorInput,
    KP := 1.0,
    KI := 1.0,
    KD := 0.1,
    DT := 0.01,
    OUT_MIN := 0.0,
    OUT_MAX := 100.0
);

TempReal := LIMIT(0.0, PidController.OUT, 100.0);
AnalogOutput := LIMIT(0.0, PidController.OUT, 100.0);

END_PROGRAM
