(* SlowBlink - Slow LED blink task (100ms cycle) *)
(* This program blinks the onboard LED every 500ms to verify persistence *)
(* After power cycle, LED should continue blinking if program persisted *)

PROGRAM SlowBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* Output mapped to onboard LED - GPIO25 (channel 0) *)
    LED AT %Q0.0 : BOOL;
END_VAR

(* Increment counter every 100ms cycle *)
Counter := Counter + 1;

(* Toggle every 5 cycles = 500ms blink rate *)
IF Counter >= 5 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED := LedState;

END_PROGRAM
