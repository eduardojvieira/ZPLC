(* FastCounter - Fast counter task (10ms cycle) *)
(* This program increments a counter every 10ms to verify fast task scheduling *)

PROGRAM FastCounter

VAR
    (* Internal counter - increments every 10ms *)
    Counter : DINT := 0;
END_VAR

(* Increment counter every cycle *)
Counter := Counter + 1;

(* Counter will overflow after ~248 days at 10ms rate *)
(* This task just proves the fast scheduler is running *)

END_PROGRAM
