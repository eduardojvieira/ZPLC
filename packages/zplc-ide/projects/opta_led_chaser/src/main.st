(* ============================================================ *)
(*  Opta LED Chaser + User LED Fade                             *)
(*  IEC 61131-3 Structured Text                                 *)
(*                                                              *)
(*  Status LEDs D0-D3  → %Q0.0 to %Q0.3                        *)
(*    Larson-scanner (bouncing chaser) every 150 ms             *)
(*                                                              *)
(*  User LED            → %Q0.4                                 *)
(*    Software PWM fade: ramps brightness 0→10→0 using a        *)
(*    fast-duty counter in the 10 ms task cycle                  *)
(* ============================================================ *)

PROGRAM OptaLEDChaser

VAR
    (* --- chaser state ---------------------------------------- *)
    StepCounter   : INT  := 0;      (* 0..5  bounce index        *)
    Direction     : INT  := 1;      (* +1 forward, -1 backward   *)
    TickCount     : INT  := 0;      (* counts task cycles        *)

    (* --- fade state ------------------------------------------ *)
    FadeDuty      : INT  := 0;      (* 0..10 duty level          *)
    FadeDir       : INT  := 1;      (* +1 up, -1 down            *)
    FadeTick      : INT  := 0;      (* subdivides fade period    *)
    FadePWMCtr    : INT  := 0;      (* 0..9 PWM carrier counter  *)

    (* --- outputs --------------------------------------------- *)
    LED_D0 AT %Q0.0 : BOOL;
    LED_D1 AT %Q0.1 : BOOL;
    LED_D2 AT %Q0.2 : BOOL;
    LED_D3 AT %Q0.3 : BOOL;
    LED_USER AT %Q0.4 : BOOL;
END_VAR

(* -------- Chaser: advance step every 15 cycles × 10 ms = 150 ms -------- *)
TickCount := TickCount + 1;
IF TickCount >= 15 THEN
    TickCount := 0;

    (* Update position *)
    StepCounter := StepCounter + Direction;

    (* Bounce at ends *)
    IF StepCounter >= 3 THEN
        StepCounter := 3;
        Direction := -1;
    END_IF;
    IF StepCounter <= 0 THEN
        StepCounter := 0;
        Direction := 1;
    END_IF;
END_IF;

(* Drive status LEDs — only the active step is ON *)
LED_D0 := (StepCounter = 0);
LED_D1 := (StepCounter = 1);
LED_D2 := (StepCounter = 2);
LED_D3 := (StepCounter = 3);

(* -------- User LED software-PWM fade ----------------------------------------
   FadeDuty ramps 0→10→0 every (50 cycles × 10 ms = 500 ms per direction).
   Each cycle: FadePWMCtr counts 0..9; LED_USER is ON when FadePWMCtr < FadeDuty.
   This gives 0 %, 10 %, 20 % … 100 % brightness visible to the eye.
----------------------------------------------------------------------------- *)

(* PWM carrier: 0..9 counts every task cycle *)
FadePWMCtr := FadePWMCtr + 1;
IF FadePWMCtr >= 10 THEN
    FadePWMCtr := 0;

    (* Every full PWM period, advance fade ramp once per 5 periods = 50 cycles *)
    FadeTick := FadeTick + 1;
    IF FadeTick >= 5 THEN
        FadeTick := 0;
        FadeDuty := FadeDuty + FadeDir;

        (* Reverse at limits *)
        IF FadeDuty >= 10 THEN
            FadeDuty := 10;
            FadeDir  := -1;
        END_IF;
        IF FadeDuty <= 0 THEN
            FadeDuty := 0;
            FadeDir  := 1;
        END_IF;
    END_IF;
END_IF;

(* PWM output: ON when carrier < duty level *)
LED_USER := (FadePWMCtr < FadeDuty);

END_PROGRAM
