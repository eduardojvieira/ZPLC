PROGRAM BlinkIL
VAR
  Blink : TON;
  Led AT %QX0.0 : BOOL;
END_VAR

(* The timer runs while the LED is off. When it is done the LED is on for one scan, which restarts the timer. *)
  LDN Led
  ST Blink.IN
  CAL Blink(PT := T#200ms)
  LD Blink.Q
  ST Led
END_PROGRAM
