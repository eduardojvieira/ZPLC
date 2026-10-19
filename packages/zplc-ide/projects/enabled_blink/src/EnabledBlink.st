PROGRAM EnabledBlink
VAR_INPUT Enable AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Lamp AT %Q0.0 : BOOL; END_VAR
VAR Clock : TON; LampOn : BOOL := FALSE; END_VAR
Clock(IN := Enable, PT := T#300ms);
IF Clock.Q THEN LampOn := NOT LampOn; Clock(IN := FALSE, PT := T#300ms); END_IF;
Lamp := LampOn AND Enable;
END_PROGRAM
