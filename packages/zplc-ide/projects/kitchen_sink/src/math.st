(*
 * Kitchen Sink 5/10 - selection, math, trigonometry and logarithm functions
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsMath
VAR
    SensorInput     : REAL := 50.0;
    SelectFlag      : BOOL := FALSE;
    TempInt         : INT := 0;
    TempReal        : REAL := 0.0;
    Angle           : REAL := 0.785398; (* PI/4 = 45 degrees *)
END_VAR

(* ============================================================================
 * SECTION 7: Selection Functions
 * ============================================================================ *)

TempReal := MAX(SensorInput, 25.0);
TempReal := MIN(TempReal, 75.0);
TempReal := LIMIT(0.0, SensorInput, 100.0);
TempReal := SEL(SelectFlag, 0.0, SensorInput);
TempInt := MUX(1, 10, 20, 30);

(* ============================================================================
 * SECTION 8: Math Functions
 * ============================================================================ *)

TempReal := ABS(-42.5);
TempInt := ABS(-100);
TempReal := NEG(SensorInput);
TempInt := 17 MOD 5;        (* MOD is an infix operator in IEC 61131-3 *)
TempReal := SQRT(144.0);
TempReal := EXPT(2.0, 8.0);
TempReal := TRUNC(3.7);
TempReal := ROUND(3.5);

(* ============================================================================
 * SECTION 9: Trigonometry Functions
 * ============================================================================ *)

TempReal := SIN(Angle);
TempReal := COS(Angle);
TempReal := TAN(Angle);
TempReal := ASIN(0.5);
TempReal := ACOS(0.5);
TempReal := ATAN(1.0);
TempReal := ATAN2(1.0, 1.0);

(* ============================================================================
 * SECTION 10: Logarithmic Functions
 * ============================================================================ *)

TempReal := LN(2.718281828);
TempReal := LOG(100.0);
TempReal := EXP(1.0);

END_PROGRAM
