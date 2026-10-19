PROGRAM FirstBlink
VAR_OUTPUT Lamp AT %Q0.0 : BOOL; END_VAR
VAR Clock : TON; LampOn : BOOL := FALSE; HalfPeriod : TIME := T#2000ms; END_VAR
(* Exercise: the lamp changes state every time Clock reaches HalfPeriod. Change HalfPeriod so the lamp is off for half a second and on for half a second. *)
Clock(IN := TRUE, PT := HalfPeriod);
IF Clock.Q THEN LampOn := NOT LampOn; Clock(IN := FALSE, PT := HalfPeriod); END_IF;
Lamp := LampOn;
END_PROGRAM
