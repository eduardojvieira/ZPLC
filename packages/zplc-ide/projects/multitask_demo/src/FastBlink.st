(* FastBlink - Fast LED toggle task (10ms cycle) *)
(* This program runs at high priority and toggles LED1 every 100ms *)

PROGRAM FastBlink

VAR
    (* Internal state *)
    Counter : INT := 0;
    LedState : BOOL := FALSE;
END_VAR

VAR_OUTPUT
    (* Output mapped to LED2 - external LED on GPIO15 *)
    LED1 AT %Q0.1 : BOOL;
END_VAR

(* Increment counter every 10ms cycle *)
Counter := Counter + 1;

(* Toggle every 10 cycles = 100ms *)
IF Counter >= 10 THEN
    LedState := NOT LedState;
    Counter := 0;
END_IF;

(* Write to output *)
LED1 := LedState;

END_PROGRAM
