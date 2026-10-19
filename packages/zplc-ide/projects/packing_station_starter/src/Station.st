PROGRAM Station
(* Packing station. Read the requirements in the lesson, then complete this program.
   Belt carries parts past a sensor; three parts make a batch. *)
VAR_INPUT
  Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; EStop AT %I0.2 : BOOL; Part AT %I0.3 : BOOL; Reset AT %I0.4 : BOOL;
END_VAR
VAR_OUTPUT Belt AT %Q0.0 : BOOL; BatchFull AT %Q0.1 : BOOL; Fault AT %Q0.2 : BOOL; END_VAR
VAR Count : CTU; Stuck : TON; END_VAR
Belt := (Start OR Belt) AND NOT Stop;
END_PROGRAM
