(*
 * Kitchen Sink 2/10 - process control blocks
 *
 * Blocks: HYSTERESIS, DEADBAND, LAG_FILTER, RAMP_REAL, INTEGRAL, DERIVATIVE
 * (PID_Compact has its own program, pid.st: it alone takes 48 bytes.)
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsProcess
VAR
    (* ===== Inputs ===== *)
    SensorInput     : REAL := 50.0;
    StopButton      : BOOL := FALSE;

    (* ===== Outputs ===== *)
    MotorPermit     : BOOL := FALSE;

    (* ===== Process Control FBs ===== *)
    HystCtrl        : HYSTERESIS;
    DeadCtrl        : DEADBAND;
    LagFilt         : LAG_FILTER;
    RampCtrl        : RAMP_REAL;
    Integrator      : INTEGRAL;
    Differentiator  : DERIVATIVE;
END_VAR

(* HYSTERESIS - On/Off control with deadband *)
HystCtrl(IN := SensorInput, HIGH := 60.0, LOW := 40.0);

(* DEADBAND - Filter small changes *)
DeadCtrl(IN := SensorInput, DB := 2.0);

(* LAG_FILTER - First-order lag filter *)
LagFilt(IN := SensorInput, T := T#100ms, CYCLE := T#10ms);

(* RAMP_REAL - Rate limiter *)
RampCtrl(IN := SensorInput, RATE := 10.0, CYCLE := T#10ms);

(* INTEGRAL - Integration *)
Integrator(IN := 1.0, CYCLE := T#10ms, RESET := StopButton);

(* DERIVATIVE - Differentiation *)
Differentiator(IN := SensorInput, CYCLE := T#10ms);

(* Final output: the motor is allowed only while the sensor is not above HIGH *)
MotorPermit := NOT HystCtrl.Q;

END_PROGRAM
