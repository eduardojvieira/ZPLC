(*
 * Pico Blinky with TON Timer
 * 
 * Demonstrates proper IEC 61131-3 timing using TON (Timer On-Delay).
 * This is the industrial-grade way to do timing in PLCs.
 * 
 * How it works:
 * - TON timer starts when IN=TRUE
 * - When ET (elapsed time) reaches PT (preset time), Q goes TRUE
 * - We use Q to toggle the LED and restart the timer
 * 
 * The BLINK function block would be simpler, but this shows
 * how to use TON for more complex timing scenarios.
 *)

PROGRAM Main

VAR
    BlinkTimer : TON;           (* Timer for blink interval *)
    LED_State : BOOL := FALSE;  (* Current LED state *)
    BlinkTime : TIME := T#500ms; (* 500ms blink interval *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* 
 * TON Timer Logic:
 * - IN := NOT BlinkTimer.Q means: start timing when NOT expired
 * - When timer expires (Q=TRUE), IN becomes FALSE, resetting the timer
 * - This creates a self-resetting pulse every 500ms
 *)
BlinkTimer(IN := NOT BlinkTimer.Q, PT := BlinkTime);

(* Toggle LED when timer expires *)
IF BlinkTimer.Q THEN
    LED_State := NOT LED_State;
END_IF;

(* Write state to physical output *)
LED_Output := LED_State;

END_PROGRAM
