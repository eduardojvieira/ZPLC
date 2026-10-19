PROGRAM Station
VAR_INPUT
  Start AT %I0.0 : BOOL; Stop AT %I0.1 : BOOL; EStop AT %I0.2 : BOOL; Part AT %I0.3 : BOOL; Reset AT %I0.4 : BOOL;
END_VAR
VAR_OUTPUT Belt AT %Q0.0 : BOOL; BatchFull AT %Q0.1 : BOOL; Fault AT %Q0.2 : BOOL; END_VAR
VAR Count : CTU; Stuck : TON; END_VAR
Count(CU := Part, R := Reset, PV := 3);
BatchFull := Count.Q;
Stuck(IN := Part, PT := T#50ms);
Fault := (Fault OR Stuck.Q) AND NOT (Reset AND NOT Part);
Belt := (Start OR Belt) AND NOT Stop AND NOT EStop AND NOT Fault AND NOT BatchFull;
END_PROGRAM
