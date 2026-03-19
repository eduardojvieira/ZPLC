(*
 * Pico Blinky - Simple Counter-based LED Toggle
 * 
 * Uses simple counters instead of TON timers:
 * - Task runs every 10ms
 * - Count up to 50 cycles = 500ms
 * - Toggle LED and reset counter
 * - Increment SlowCounter every 500ms
 *)

PROGRAM Main

VAR
    Counter : INT := 0;             (* 10ms cycle counter *)
    SlowCounter : INT := 0;         (* Increments every 500ms *)
    LED_State : BOOL := FALSE;      (* Internal LED state *)
END_VAR

VAR_OUTPUT
    LED_Output AT %Q0.0 : BOOL;
    PWR AT %Q0.1 : BOOL;
END_VAR

PWR := TRUE;

(* Increment counter every 10ms cycle *)
Counter := Counter + 1;

(* Toggle every 37 cycles = 481ms *)
IF Counter >= 37 THEN
    LED_State := NOT LED_State;
    SlowCounter := SlowCounter + 1;
    Counter := 0;
END_IF;

(* Write state to physical output *)
LED_Output := LED_State;

END_PROGRAM
