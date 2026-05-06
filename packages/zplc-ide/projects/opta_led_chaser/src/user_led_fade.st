(* ============================================================ *)
(*  User LED Breathing Fade                                     *)
(*  IEC 61131-3 Structured Text                                 *)
(*                                                              *)
(*  The Opta User LED is a digital output (no PWM hardware).    *)
(*  We fake brightness by varying the ON duty cycle within a    *)
(*  fixed 600 ms window (12 × 50 ms ticks):                     *)
(*    Phase 0..DutyLvl-1 → LED ON                               *)
(*    Phase DutyLvl..11  → LED OFF                              *)
(*  DutyLvl ramps 0→11→0 (one step per 600 ms period),          *)
(*  creating a smooth ~13-second breathe cycle.                  *)
(* ============================================================ *)

PROGRAM UserLedFade

VAR
    Tick    : TON;          (* 50 ms base tick *)
    Phase   : INT := 0;    (* 0..11 position within 600 ms window *)
    DutyLvl : INT := 0;    (* 0..11  ON phases per window *)
    FadeDir : INT := 1;    (* +1 brightening, -1 dimming *)

    LED_USER AT %Q0.4 : BOOL;
END_VAR

(* Self-resetting 50 ms tick *)
Tick(IN := NOT Tick.Q, PT := T#50ms);

IF Tick.Q THEN
    (* Advance phase counter within the 600 ms PWM window *)
    Phase := Phase + 1;

    IF Phase >= 12 THEN
        Phase := 0;

        (* One step per full window: ramp duty level *)
        DutyLvl := DutyLvl + FadeDir;

        IF DutyLvl >= 11 THEN
            DutyLvl := 11;
            FadeDir := -1;
        ELSIF DutyLvl <= 0 THEN
            DutyLvl := 0;
            FadeDir := 1;
        END_IF;
    END_IF;
END_IF;

(* LED is ON during the first DutyLvl phases of every window *)
LED_USER := (Phase < DutyLvl);

END_PROGRAM
