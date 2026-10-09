PROGRAM Blinky
VAR_OUTPUT LED_Output AT %Q0.0 : BOOL; END_VAR
(* Exercise: add a TON oscillator with a 500 ms half period: LED_Output stays OFF for 500 ms, then ON for 500 ms, and repeats. *)
LED_Output := FALSE;
END_PROGRAM
