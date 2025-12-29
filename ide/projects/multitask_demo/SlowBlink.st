(* SlowBlink - Slow LED toggle task (100ms cycle) *)
(* This program runs at lower priority and toggles LED2 every 500ms *)

PROGRAM SlowBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* Output mapped to LED2 *)
    LED2 AT %Q0.1 : BOOL;
END_VAR

(* Increment counter every 100ms cycle *)
Counter := Counter + 1;

(* Toggle every 5 cycles = 500ms *)
IF Counter >= 5 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED2 := LedState;

END_PROGRAM
