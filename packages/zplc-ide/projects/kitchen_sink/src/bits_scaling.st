(*
 * Kitchen Sink 6/10 - bitwise, logic, conversion, scaling and system functions
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsBitsScaling
VAR
    StartButton     : BOOL := FALSE;
    StopButton      : BOOL := FALSE;
    SensorInput     : REAL := 50.0;
    TempBool        : BOOL;
    TempInt         : INT := 0;
    TempReal        : REAL := 0.0;
    Normalized      : REAL := 0.0;
    Scaled          : REAL := 0.0;
    SysUptime       : DINT := 0;
    SysCycleTime    : DINT := 0;
END_VAR

(* ============================================================================
 * SECTION 11: Bitwise Functions
 * ============================================================================ *)

TempInt := SHL(1, 4);       (* 1 << 4 = 16 *)
TempInt := SHR(256, 4);     (* 256 >> 4 = 16 *)
TempInt := ROL(1, 31);      (* Rotate left *)
TempInt := ROR(1, 1);       (* Rotate right *)

(* ============================================================================
 * SECTION 12: Logic Functions
 * ============================================================================ *)

TempBool := NAND(StartButton, StopButton);
TempBool := NOR(StartButton, StopButton);

(* ============================================================================
 * SECTION 13: Type Conversion Functions
 * ============================================================================ *)

TempReal := INT_TO_REAL(TempInt);
TempInt := REAL_TO_INT(TempReal);
TempInt := BOOL_TO_INT(StartButton);
TempBool := INT_TO_BOOL(TempInt);

(* ============================================================================
 * SECTION 14: Scaling Functions
 * ============================================================================ *)

Normalized := NORM_X(0.0, SensorInput, 100.0);
Scaled := SCALE_X(0.0, Normalized, 4095.0);

(* ============================================================================
 * SECTION 15: System Functions
 * ============================================================================ *)

SysUptime := UPTIME();
SysCycleTime := CYCLE_TIME();
WATCHDOG_RESET();

END_PROGRAM
