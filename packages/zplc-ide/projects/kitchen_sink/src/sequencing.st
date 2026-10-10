(*
 * Kitchen Sink 1/10 - timers, edges, bistables, counters, generators
 *
 * Part of the standard-library conformance fixture. The original single
 * program needed about 770 bytes of WORK memory, but every PROGRAM owns a
 * 256-byte region (WORK_MEMORY_REGION_SIZE, init flag included), so the
 * fixture is split into ten small programs, one per task. Each program
 * keeps the blocks that feed each other together.
 *
 * Blocks: TON, TOF, TP, R_TRIG, F_TRIG, RS, SR, CTU, CTD, CTUD, BLINK, PWM, PULSE
 *
 * SPDX-License-Identifier: MIT
 *)

PROGRAM KsSequencing
VAR
    (* ===== Inputs ===== *)
    StartButton     : BOOL := FALSE;
    StopButton      : BOOL := FALSE;
    CounterPulse    : BOOL := FALSE;

    (* ===== Outputs ===== *)
    MotorOutput     : BOOL := FALSE;
    AlarmOutput     : BOOL := FALSE;

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
Latch_RS(S := RisingEdge.Q, R1 := FallingEdge.Q);

(* SR - Set-dominant latch *)
Latch_SR(S1 := RisingEdge.Q, R := FallingEdge.Q);

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
Blinker(ENABLE := Latch_RS.Q1, T_ON := T#500ms, T_OFF := T#500ms);

(* PWM - Pulse Width Modulation *)
PwmGen(ENABLE := TRUE, PERIOD := T#1000ms, DUTY := 75);

(* PULSE - Single pulse generator *)
PulseGen(TRIG := RisingEdge.Q, PT := T#100ms);

(* ============================================================================
 * SECTION 6: Outputs
 * ============================================================================ *)

MotorOutput := Latch_RS.Q1 AND TimerOff.Q;
AlarmOutput := CountUp.Q OR Blinker.Q;

END_PROGRAM
