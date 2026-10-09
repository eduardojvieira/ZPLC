(* ============================================================ *)
(*  Opta LED Chaser                                             *)
(*  IEC 61131-3 Structured Text                                 *)
(*                                                              *)
(*  D0–D3 (%Q0.0–%Q0.3, the four Opta status LEDs) Larson       *)
(*  scanner: one LED lit, bouncing D0 → D3 → D0.                *)
(*  Driven by a self-resetting TON (IN := NOT Timer.Q): Q is    *)
(*  TRUE for one scan, then the timer restarts, so a step takes *)
(*  PT + 2 scans. With the 10 ms task: first step at 150 ms,    *)
(*  then one every 170 ms.                                      *)
(* ============================================================ *)

PROGRAM OptaLEDChaser

VAR
    Timer   : TON;
    Step    : INT := 0;    (* 0..3  active LED index *)
    Dir     : INT := 1;    (* +1 forward, -1 backward *)

    LED_D0 AT %Q0.0 : BOOL;
    LED_D1 AT %Q0.1 : BOOL;
    LED_D2 AT %Q0.2 : BOOL;
    LED_D3 AT %Q0.3 : BOOL;
END_VAR

(* Self-resetting 150 ms tick:
   When Timer.Q is FALSE → IN=TRUE → timer counts.
   When Timer.Q becomes TRUE → IN=FALSE → timer resets next scan.
   Result: Timer.Q is TRUE for one scan every 150 ms + 2 scans
   (170 ms with a 10 ms task), forever. *)
Timer(IN := NOT Timer.Q, PT := T#150ms);

IF Timer.Q THEN
    (* Advance step *)
    Step := Step + Dir;

    (* Bounce at the ends *)
    IF Step >= 3 THEN
        Step := 3;
        Dir  := -1;
    ELSIF Step <= 0 THEN
        Step := 0;
        Dir  := 1;
    END_IF;
END_IF;

(* Drive LEDs — only the active step lights up *)
LED_D0 := (Step = 0);
LED_D1 := (Step = 1);
LED_D2 := (Step = 2);
LED_D3 := (Step = 3);

END_PROGRAM
