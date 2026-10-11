PROGRAM Jumps
VAR
  (* Results - all should stay at their initial values *)
  skip1_result AT %QW0 : INT := 0;
  skip2_result AT %QW1 : INT := 0;
  exec1_result AT %QW2 : INT := 0;
  exec2_result AT %QW3 : INT := 0;
  jump_cond AT %QX8.0 : BOOL := TRUE;
END_VAR

(* Test 1: JMPC - Conditional Jump when TRUE *)
(* When jump_cond is TRUE, skip the next code *)
LD jump_cond
JMPC AfterSkip1

(* This should be SKIPPED when jump_cond=TRUE *)
LD 999
ST skip1_result

AfterSkip1:
(* This always executes - set exec1_result to 42 *)
LD 42
ST exec1_result

(* Test 2: JMP - Unconditional Jump *)
JMP AfterSkip2

(* This should ALWAYS be skipped *)
LD 888
ST skip2_result

AfterSkip2:
(* This always executes - set exec2_result to 77 *)
LD 77
ST exec2_result

END_PROGRAM
