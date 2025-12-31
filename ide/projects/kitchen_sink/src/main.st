(*
 * Kitchen Sink Test Program
 * 
 * This program exercises ALL standard library Function Blocks and Functions
 * to verify consistency between runtime and IDE.
 * 
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KitchenSink
VAR
    (* ===== Inputs ===== *)
    StartButton     : BOOL := FALSE;
    StopButton      : BOOL := FALSE;
    SensorInput     : REAL := 50.0;
    CounterPulse    : BOOL := FALSE;
    
    (* ===== Outputs ===== *)
    MotorOutput     : BOOL := FALSE;
    AlarmOutput     : BOOL := FALSE;
    AnalogOutput    : REAL := 0.0;
    
    (* ===== Timer FBs ===== *)
    TimerOn         : TON;
    TimerOff        : TOF;
    TimerPulse      : TP;
    
    (* ===== Edge Detection FBs ===== *)
    RisingEdge      : R_TRIG;
    FallingEdge     : F_TRIG;
    
    (* ===== Bistable FBs ===== *)
    Latch_RS        : RS;
    Latch_SR        : SR;
    
    (* ===== Counter FBs ===== *)
    CountUp         : CTU;
    CountDown       : CTD;
    CountUpDown     : CTUD;
    
    (* ===== Generator FBs ===== *)
    Blinker         : BLINK;
    PwmGen          : PWM;
    PulseGen        : PULSE;
    
    (* ===== Process Control FBs ===== *)
    HystCtrl        : HYSTERESIS;
    DeadCtrl        : DEADBAND;
    LagFilt         : LAG_FILTER;
    RampCtrl        : RAMP_REAL;
    Integrator      : INTEGRAL;
    Differentiator  : DERIVATIVE;
    PidController   : PID_Compact;
    
    (* ===== System Buffer FBs ===== *)
    FifoBuffer      : FIFO;
    LifoBuffer      : LIFO;
    
    (* ===== Working Variables ===== *)
    TempBool        : BOOL;
    TempInt         : INT := 0;
    TempReal        : REAL := 0.0;
    TempReal2       : REAL := 0.0;
    Angle           : REAL := 0.785398; (* PI/4 = 45 degrees *)
    Normalized      : REAL := 0.0;
    Scaled          : REAL := 0.0;
    SysUptime       : DINT := 0;
    SysCycleTime    : DINT := 0;
    
    (* ===== String Variables ===== *)
    Str1            : STRING := 'Hello';
    Str2            : STRING := 'World';
    StrResult       : STRING;
    StrLen          : INT := 0;
    StrPos          : INT := 0;
END_VAR

(* ============================================================================
 * SECTION 1: Timer Function Blocks
 * ============================================================================ *)

(* TON - On-delay timer *)
TimerOn(IN := StartButton, PT := T#1000ms);

(* TOF - Off-delay timer *)
TimerOff(IN := TimerOn.Q, PT := T#500ms);

(* TP - Pulse timer *)
TimerPulse(IN := StopButton, PT := T#200ms);

(* ============================================================================
 * SECTION 2: Edge Detection
 * ============================================================================ *)

(* R_TRIG - Rising edge detection *)
RisingEdge(CLK := StartButton);

(* F_TRIG - Falling edge detection *)
FallingEdge(CLK := StopButton);

(* ============================================================================
 * SECTION 3: Bistable Latches
 * ============================================================================ *)

(* RS - Reset-dominant latch *)
Latch_RS(SET := RisingEdge.Q, RESET1 := FallingEdge.Q);

(* SR - Set-dominant latch *)
Latch_SR(SET1 := RisingEdge.Q, RESET := FallingEdge.Q);

(* ============================================================================
 * SECTION 4: Counters
 * ============================================================================ *)

(* CTU - Count Up *)
CountUp(CU := CounterPulse, R := StopButton, PV := 100);

(* CTD - Count Down *)
CountDown(CD := CounterPulse, LD := StartButton, PV := 50);

(* CTUD - Count Up/Down *)
CountUpDown(CU := RisingEdge.Q, CD := FallingEdge.Q, R := StopButton, LD := FALSE, PV := 200);

(* ============================================================================
 * SECTION 5: Generators
 * ============================================================================ *)

(* BLINK - Oscillator *)
Blinker(ENABLE := Latch_RS.Q1, CYCLE := T#500ms);

(* PWM - Pulse Width Modulation *)
PwmGen(ENABLE := TRUE, PERIOD := T#1000ms, DUTY := 75);

(* PULSE - Single pulse generator *)
PulseGen(TRIGGER := RisingEdge.Q, DURATION := T#100ms);

(* ============================================================================
 * SECTION 6: Process Control
 * ============================================================================ *)

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

(* PID_Compact - PID Controller *)
PidController(
    SETPOINT := 50.0,
    ACTUAL := SensorInput,
    KP := 1.0,
    TI := T#1000ms,
    TD := T#100ms,
    CYCLE := T#10ms,
    MANUAL := FALSE,
    MAN_VALUE := 0.0,
    OUT_MIN := 0.0,
    OUT_MAX := 100.0
);

(* ============================================================================
 * SECTION 7: Selection Functions
 * ============================================================================ *)

TempReal := MAX(SensorInput, 25.0);
TempReal := MIN(TempReal, 75.0);
TempReal := LIMIT(0.0, PidController.OUT, 100.0);
TempReal := SEL(Latch_RS.Q1, 0.0, SensorInput);
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

(* ============================================================================
 * SECTION 16: String Functions
 * ============================================================================ *)

StrLen := LEN(Str1);
StrResult := CONCAT(Str1, ' ');
StrResult := CONCAT(StrResult, Str2);
StrResult := LEFT(Str1, 3);
StrResult := RIGHT(Str2, 3);
StrResult := MID(Str1, 2, 3);
StrPos := FIND(StrResult, 'ell');
StrResult := INSERT(Str1, '!!!', 5);
StrResult := DELETE(StrResult, 3, 5);
StrResult := REPLACE(Str1, 'Hi', 1, 2);
StrResult := COPY(Str2, StrResult);  (* COPY(src, dst) returns dst *)
TempInt := STRCMP(Str1, Str2);
TempBool := EQ_STRING(Str1, 'Hello');
TempBool := NE_STRING(Str1, Str2);
StrResult := CLEAR(StrResult);   (* CLEAR returns the cleared string *)

(* ============================================================================
 * SECTION 17: Final Outputs
 * ============================================================================ *)

MotorOutput := Latch_RS.Q1 AND TimerOff.Q AND NOT HystCtrl.Q;
AlarmOutput := CountUp.Q OR Blinker.Q;
AnalogOutput := LIMIT(0.0, PidController.OUT, 100.0);

END_PROGRAM
