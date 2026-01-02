(*
 * Pico Blinky - Simple Counter-based LED Toggle
 * 
 * Uses a simple counter instead of TON timer:
 * - Task runs every 10ms
 * - Count up to 50 cycles = 500ms
 * - Toggle LED and reset counter
 *)

PROGRAM Main

VAR
    Counter : INT := 0;         (* Cycle counter *)
    LED_State : BOOL := FALSE;  (* Internal LED state *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
END_VAR

(* Increment counter every 10ms cycle *)
Counter := Counter + 1;

(* Toggle every 50 cycles = 500ms *)
IF Counter >= 50 THEN
    LED_State := NOT LED_State;
    Counter := 0;
END_IF;

(* Write state to physical output *)
LED_Output := LED_State;

END_PROGRAM
