(*
 * Pico Blinky with TON Timer
 * 
 * Uses the TON (Timer On-Delay) function block.
 * More complex than BLINK but demonstrates manual timer reset pattern.
 * 
 * Pattern:
 * - Timer runs until Q=TRUE
 * - When Q=TRUE, toggle LED and set reset flag
 * - Next cycle, reset flag causes IN=FALSE, resetting timer
 * - Following cycle, timer starts again
 *)

PROGRAM Main

VAR
    BlinkTimer : TON;            (* Timer instance *)
    LED_State : BOOL := FALSE;   (* Current LED state *)
    ResetTimer : BOOL := FALSE;  (* Reset flag for timer *)
    BlinkTime : TIME := T#500ms; (* Blink interval *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Timer runs when NOT resetting *)
BlinkTimer(IN := NOT ResetTimer, PT := BlinkTime);

(* When timer expires, toggle and request reset *)
IF BlinkTimer.Q THEN
    LED_State := NOT LED_State;
    ResetTimer := TRUE;
ELSE
    ResetTimer := FALSE;
END_IF;

(* Output *)
LED_Output := LED_State;

END_PROGRAM
