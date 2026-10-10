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
DeadCtrl(IN := SensorInput, WIDTH := 2.0);

(* LAG_FILTER - First-order lag filter *)
(* GAIN is the share of the difference taken each scan: 10 ms / (100 ms + 10 ms) *)
LagFilt(IN := SensorInput, GAIN := 0.09);

(* RAMP_REAL - Rate limiter *)
RampCtrl(IN := SensorInput, RATE := 10.0);

(* INTEGRAL - Integration *)
(* DT is the sample time in seconds *)
Integrator(IN := 1.0, DT := 0.01, RESET := StopButton);

(* DERIVATIVE - Differentiation *)
Differentiator(IN := SensorInput, DT := 0.01);

(* Final output: the motor is allowed only while the sensor is not above HIGH *)
MotorPermit := NOT HystCtrl.Q;

END_PROGRAM
