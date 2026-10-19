PROGRAM FirstBlink
VAR_OUTPUT Lamp AT %Q0.0 : BOOL; END_VAR
VAR Clock : TON; LampOn : BOOL := FALSE; HalfPeriod : TIME := T#500ms; END_VAR
(* Exercise: the lamp changes state every time Clock reaches HalfPeriod. *)
Clock(IN := TRUE, PT := HalfPeriod);
IF Clock.Q THEN LampOn := NOT LampOn; Clock(IN := FALSE, PT := HalfPeriod); END_IF;
Lamp := LampOn;
END_PROGRAM
