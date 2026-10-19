PROGRAM EnabledBlink
VAR_INPUT Enable AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Lamp AT %Q0.0 : BOOL; END_VAR
VAR Clock : TON; LampOn : BOOL := FALSE; END_VAR
(* Exercise: while Enable is ON, change Lamp every 500 ms with a TON and a LampOn memory; while Enable is OFF, Lamp is OFF. *)
Lamp := FALSE;
END_PROGRAM
