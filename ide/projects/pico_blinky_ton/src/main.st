(*
 * Pico Blinky - Simple counter-based toggle
 * 
 * This is the simplest possible blink - just count cycles.
 * Task runs every 10ms, so 50 cycles = 500ms.
 *)

PROGRAM Main

VAR
    Counter : INT := 0;
    LED_State : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Increment counter *)
Counter := Counter + 1;

(* Toggle every 50 cycles (500ms at 10ms/cycle) *)
IF Counter >= 50 THEN
    Counter := 0;
    LED_State := NOT LED_State;
END_IF;

(* Output *)
LED_Output := LED_State;

END_PROGRAM
